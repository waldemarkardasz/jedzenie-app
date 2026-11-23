/* Jedzenie — dziennik żywienia.
 * Powłoka bez danych: karty dni i zdjęcia są w prywatnym repozytorium jedzenie-dane,
 * pobierane tokenem, który użytkownik wkleja raz i który nie opuszcza telefonu.
 * Liczy automat w repozytorium (GitHub Actions + Claude); aplikacja wysyła zdjęcia i zgłoszenia. */
'use strict';

const API = 'https://api.github.com';
const REPO = 'waldemarkardasz/jedzenie-dane';
const K = { token: 'jedz.token', karty: 'jedz.karty' };
const DNI_WSTECZ = 30;
const $ = (id) => document.getElementById(id);

const pamiec = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  } catch (e) { return null; }
};

// ---------- czas warszawski ----------
const dataW = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(d);
const godzW = (d = new Date()) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' }).format(d);
const idTeraz = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`;
};
const dzienTyg = (iso) => new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
const liczba = (n) => Math.round(n || 0).toLocaleString('pl-PL');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- GitHub ----------
async function gh(sciezka, opcje = {}) {
  const odp = await fetch(`${API}/repos/${REPO}/${sciezka}`, {
    cache: 'no-store',
    ...opcje,
    headers: { Authorization: `Bearer ${pamiec(K.token)}`, Accept: 'application/vnd.github+json', ...(opcje.headers || {}) },
  });
  return odp;
}
async function plik(sciezka, jakoBlob) {
  const odp = await gh(`contents/${sciezka}?t=${Date.now()}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
  if (odp.status === 404) return null;
  if (odp.status === 401 || odp.status === 403) throw Object.assign(new Error('token'), { token: true });
  if (!odp.ok) throw new Error(`GitHub ${odp.status}`);
  return jakoBlob ? odp.blob() : odp.json();
}
async function zgloszenie(tytul, tresc) {
  const odp = await gh('issues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: tytul, body: tresc || '' }) });
  if (!odp.ok) throw new Error(`Nie udało się wysłać (${odp.status}). Sprawdź, czy token ma prawo do Issues.`);
}
async function wgraj(sciezka, base64) {
  const odp = await gh(`contents/${sciezka}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `zdjęcie ${sciezka}`, content: base64 }) });
  if (!odp.ok) throw new Error(`Nie udało się wgrać zdjęcia (${odp.status}).`);
}

// ---------- karty ----------
let karty = {};          // data → karta
let dni = [];            // posortowane daty
const dzis = () => dataW();

function zapamietaj() { pamiec(K.karty, JSON.stringify(karty)); }

async function odswiez() {
  const indeks = (await plik('karty/index.json')) || [];
  const zakres = new Set([...indeks.slice(-DNI_WSTECZ), dzis()]);
  const wyniki = await Promise.all([...zakres].map(async (d) => [d, await plik(`karty/${d}.json`).catch(() => karty[d] || null)]));
  karty = {};
  for (const [d, k] of wyniki) if (k) karty[d] = k;
  zapamietaj();
  rysuj();
}

function pustaKarta(d) {
  return { data: d, zamkniety: false, cel: null, suma: { kcal: 0, b: 0, w: 0, t: 0 }, posilki: [], komentarz: {} };
}

// ---------- rysowanie ----------
const IK_DYMEK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4FC3D4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
const IK_APARAT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7380" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';

function pierscien(zjedzone, cel) {
  const obwod = 2 * Math.PI * 56;
  const czesc = cel ? Math.min(1, zjedzone / cel) : 0;
  return `<div class="pierscien"><svg width="128" height="128" viewBox="0 0 132 132" role="img" aria-label="Zjedzone ${liczba(zjedzone)} z ${liczba(cel)} kcal">
    <circle cx="66" cy="66" r="56" fill="none" stroke="#262B34" stroke-width="11"/>
    <circle cx="66" cy="66" r="56" fill="none" stroke="#4FC3D4" stroke-width="11" stroke-linecap="round" stroke-dasharray="${(czesc * obwod).toFixed(0)} ${obwod.toFixed(0)}"/></svg>
    <div class="srodek"><span class="liczba">${liczba(zjedzone)}</span><span class="et">z ${liczba(cel)} kcal</span></div></div>`;
}

function makro(nazwa, zj, cel, kolor, dopisek) {
  const pct = cel ? zj / cel : 0;
  let tor, pod;
  if (pct > 1.05) {
    const w = Math.round(100 / pct);
    tor = `<div style="width:${w}%;background:${kolor}"></div><div style="width:${100 - w}%;background:#F07D6B"></div>`;
    pod = `<span class="pod" style="color:#F07D6B">+${liczba(zj - cel)} g ponad cel</span>`;
  } else {
    tor = `<div style="width:${Math.round(Math.min(1, pct) * 100)}%;background:${kolor};border-radius:4px"></div>`;
    pod = pct >= 0.95
      ? `<span class="pod" style="color:#7FB89A">cel osiągnięty${dopisek ? ' · ' + dopisek : ''}</span>`
      : `<span class="pod" style="color:${kolor}">zostało ${liczba(cel - zj)} g${dopisek ? ' · ' + dopisek : ''}</span>`;
  }
  return `<div class="makro"><div class="rzad"><span class="nazwa">${nazwa}</span><span class="wart">${liczba(zj)} <span>/ ${liczba(cel)} g</span></span></div>
    <div class="tor">${tor}</div>${pod}</div>`;
}

function nasycone(zj, limit) {
  if (zj == null || !limit) return '';
  const pct = zj / limit, ponad = pct > 1;
  const w = ponad ? Math.round(100 / pct) : Math.round(pct * 100);
  return `<div class="makro" style="margin:-4px 0 0 14px;padding-left:12px;border-left:2px solid #2E3440;gap:6px">
    <div class="rzad"><span style="font-size:12.5px;font-weight:600;color:#D5DAE1">w tym nasycone</span><span style="font-size:12.5px;font-weight:700">${liczba(zj)} <span>/ limit ${liczba(limit)} g</span></span></div>
    <div class="tor" style="height:6px">${ponad ? `<div style="width:${w}%;background:#8E6A9A"></div><div style="width:${100 - w}%;background:#F07D6B"></div>` : `<div style="width:${w}%;background:#8E6A9A;border-radius:4px"></div>`}</div>
    <span class="pod" style="color:${ponad ? '#F07D6B' : pct >= 0.8 ? '#E8A33D' : '#9BA3B0'}">${ponad ? `+${liczba(zj - limit)} g ponad limit` : `zostało ${liczba(limit - zj)} g do limitu`}</span></div>`;
}

function chipy(o) {
  return `<div class="chipy"><span class="chip cb">B ${liczba(o.b)} g</span><span class="chip cw">W ${liczba(o.w)} g</span><span class="chip ct">T ${liczba(o.t)} g${o.tn != null ? ` · nas. ${liczba(o.tn)}` : ''}</span></div>`;
}

function rysujDzien(k, i, ile) {
  const d = k.data, toDzis = d === dzis(), c = k.cel, s = k.suma || {};
  const kom = k.komentarz || {};
  const zostalo = c ? c.kcal - s.kcal : 0;
  const kropki = `<div class="kropki" aria-hidden="true">${Array.from({ length: Math.min(ile, 7) }, (_, j) => `<span class="${j === Math.min(ile, 7) - 1 - (ile - 1 - i) ? 'ta' : ''}"></span>`).join('')}</div>`;

  let h = `<div class="naglowek"><span class="data">${esc(dzienTyg(d))}</span>`;
  h += toDzis
    ? `<span class="stan zywy">dziś${k.aktualizacja ? ' · aktualizacja ' + esc(k.aktualizacja.slice(11)) : ''}</span><h1>Jedzenie na dziś</h1></div>`
    : `<span class="stan">dzień zamknięty</span><h1>${esc(kom.tytul || 'Podsumowanie dnia')}</h1></div>`;

  if (!c) {
    h += `<div class="pusto">${przeliczam ? 'Przeliczam kartę po pierwszym posiłku — to potrwa ok. minuty.' : 'Na dziś nie ma jeszcze karty.<br>Dodaj pierwszy posiłek — cel i komentarz pojawią się po przeliczeniu.'}</div>`;
    return h;
  }

  // kalorie
  const prawa = toDzis
    ? `<span class="et">Zostało na dziś</span><span class="zostalo">${liczba(Math.max(0, zostalo))} <small>kcal</small></span>
       <span class="opis">${zostalo < 0 ? `${liczba(-zostalo)} kcal ponad cel` : `${Math.round((s.kcal / c.kcal) * 100)}% celu o ${godzW()}`}</span>`
    : `<span class="et">Bilans dnia</span><span class="zostalo" style="color:${Math.abs(zostalo) < 150 ? '#7FB89A' : '#E8A33D'}">${zostalo > 0 ? '−' : '+'}${liczba(Math.abs(zostalo))} <small>kcal</small></span>
       <span class="opis">Cel: podstawa ${liczba(c.podstawa)} + trening ${liczba(c.trening_kcal)}</span>`;
  h += `<div class="kafel duzy kcal">${pierscien(s.kcal, c.kcal)}<div style="display:flex;flex-direction:column;gap:6px;min-width:0">${prawa}</div></div>`;

  // skąd cel
  const udz = c.kcal ? Math.round((c.podstawa / c.kcal) * 100) : 100;
  h += `<div class="kafel"><div class="rzad"><span class="et">Skąd cel ${liczba(c.kcal)} kcal</span>
      <span class="plakietka ${c.zrodlo === 'garmin' ? 'garmin' : ''}">${c.zrodlo === 'garmin' ? 'GARMIN' : 'PLAN'}</span></div>
    <div class="belka"><div style="width:${udz}%;background:#3B4250"></div><div style="width:${100 - udz}%;background:#4FC3D4"></div></div>
    <div class="rzad" style="font-size:12px;color:#B6BDC8"><span>Podstawa dnia <b style="color:#F2F4F7">${liczba(c.podstawa)}</b></span><span>Trening <b style="color:#4FC3D4">+${liczba(c.trening_kcal)}</b></span></div>
    <span style="font-size:11px;line-height:1.5" class="szary">${esc(c.trening_opis)}${c.zrodlo === 'plan' && toDzis ? '. Po wgraniu treningu z Garmina cel przeliczy się z mocy.' : ''}</span></div>`;

  // makro
  h += `<div class="kafel"><span class="et">Makroskładniki</span>
    ${makro('Białko', s.b, c.b, '#8FB8F0', `${(c.b / 79).toFixed(1).replace('.', ',')} g/kg`)}
    ${makro('Węglowodany', s.w, c.w, '#E8A33D')}
    ${makro('Tłuszcz', s.t, c.t, '#C99BDB')}${nasycone(s.tn, c.tn)}</div>`;

  // komentarz
  if (kom.komentarz) {
    h += `<div class="komentarz"><div class="glowa">${IK_DYMEK}${toDzis ? 'KOMENTARZ' : 'PODSUMOWANIE'}</div><p>${esc(kom.komentarz)}</p>`;
    if (toDzis && kom.propozycje && kom.propozycje.length) {
      h += `<span class="sek">PROPOZYCJA NA RESZTĘ DNIA</span>`;
      for (const p of kom.propozycje) {
        h += `<div class="prop"><div class="rzad"><b>${esc(p.nazwa)}</b><span class="kiedy">${esc(p.kiedy || '')}${p.kcal ? ' · ~' + liczba(p.kcal) + ' kcal' : ''}</span></div>
          <span class="co">${esc(p.opis)}</span>${chipy(p)}</div>`;
      }
      if (kom.po_propozycjach) h += `<span class="stopka">${esc(kom.po_propozycjach)}</span>`;
    }
    if (!toDzis && kom.na_jutro) h += `<span class="sek">NA NASTĘPNY DZIEŃ</span><p style="font-size:13px;color:#B6BDC8">${esc(kom.na_jutro)}</p>`;
    h += `</div>`;
  }

  // posiłki
  const pos = k.posilki || [];
  if (toDzis) {
    h += `<div style="display:flex;flex-direction:column;gap:10px"><span class="et">Posiłki dziś · ${pos.length}</span>`;
    for (const p of pos) {
      h += `<div class="posilek"><div class="miniatura" data-zdj="${esc((p.zdjecia || [])[0] || '')}">${IK_APARAT}</div>
        <div class="info"><div class="rzad"><b>${esc(p.nazwa)}</b><b>${liczba(p.kcal)} <span style="font-size:11px;font-weight:500" class="szary">kcal</span></b></div>
        <div style="display:flex;gap:8px;align-items:center"><span style="font-size:11px" class="szary">${esc(p.godzina)}</span>${p.pewnosc === 'niska' ? '<span class="pewnosc">PEWNOŚĆ NISKA</span>' : ''}</div>
        <span class="co">${esc(p.opis)}</span><span class="mak">B ${liczba(p.b)} · W ${liczba(p.w)} · T ${liczba(p.t)}${p.tn != null ? ` (nas. ${liczba(p.tn)})` : ''}</span></div></div>`;
    }
    if (!pos.length) h += `<div class="pusto" style="padding:14px">Jeszcze nic dziś nie dodano.</div>`;
    h += `</div>`;
  } else {
    h += `<div class="kafel lista"><div class="poz"><span class="et">Posiłki · ${pos.length}</span><span></span><span class="et">kcal · B</span></div>`;
    for (const p of pos) h += `<div class="poz"><span>${esc(p.godzina)}</span><span>${esc(p.opis)}</span><span>${liczba(p.kcal)} · ${liczba(p.b)}</span></div>`;
    h += `</div>${kropki}`;
  }
  return h;
}

let obserwator;
let przeliczam = false;
function rysuj(przewinNaKoniec) {
  const dzisiaj = dzis();
  if (!karty[dzisiaj]) karty[dzisiaj] = pustaKarta(dzisiaj);
  dni = Object.keys(karty).sort();
  const kontener = $('dni');
  const bylo = kontener.scrollLeft, bylaSzer = kontener.scrollWidth;
  kontener.innerHTML = dni.map((d, i) => `<section class="dzien${d === dzisiaj ? ' dzis' : ''}" data-d="${d}" aria-label="${esc(dzienTyg(d))}"><div class="tresc">${rysujDzien(karty[d], i, dni.length)}</div></section>`).join('');
  const ileK = Math.min(dni.length, 7);
  $('kropki').innerHTML = Array.from({ length: ileK }, (_, j) => `<span class="${j === ileK - 1 ? 'ta' : ''}"></span>`).join('');
  if (przewinNaKoniec || bylaSzer === 0 || bylo >= bylaSzer - kontener.clientWidth * 1.5) kontener.scrollLeft = kontener.scrollWidth;
  else kontener.scrollLeft = bylo;

  obserwator?.disconnect();
  obserwator = new IntersectionObserver((wpisy) => {
    for (const w of wpisy) if (w.isIntersecting && w.intersectionRatio > 0.6) $('dok').classList.toggle('schowany', w.target.dataset.d !== dzisiaj);
  }, { root: kontener, threshold: [0.6] });
  kontener.querySelectorAll('.dzien').forEach((el) => obserwator.observe(el));
  $('dok').classList.toggle('schowany', !!kontener.scrollLeft && kontener.scrollLeft < kontener.scrollWidth - kontener.clientWidth * 1.5);
  miniatury();
}

const blobyZdjec = {};
async function miniatury() {
  for (const el of document.querySelectorAll('.miniatura[data-zdj]')) {
    const s = el.dataset.zdj;
    if (!s) continue;
    try {
      if (!blobyZdjec[s]) { const b = await plik(s, true); if (!b) continue; blobyZdjec[s] = URL.createObjectURL(b); }
      el.innerHTML = `<img src="${blobyZdjec[s]}" alt="Zdjęcie posiłku">`;
    } catch (e) { /* miniatura nie jest konieczna */ }
  }
}

function info(tekst, ms) {
  const el = $('pasek-info');
  el.textContent = tekst; el.hidden = !tekst;
  clearTimeout(info.t);
  if (ms) info.t = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- dodawanie posiłku ----------
const stan = { id: null, data: null, godzina: null, zdjecia: [], szacunek: null, czeka: false };

function otworzDodaj() {
  Object.assign(stan, { id: null, data: dzis(), godzina: godzW(), zdjecia: [], szacunek: null, czeka: false });
  $('opis').value = '';
  $('dodaj-czas').textContent = `${dzienTyg(stan.data)} · ${stan.godzina}`;
  rysujDodaj();
  $('dodaj').hidden = false;
  $('dodaj').scrollTop = 0;
}
function zamknijDodaj() { $('dodaj').hidden = true; stan.zdjecia.forEach((z) => URL.revokeObjectURL(z.url)); }

function rysujDodaj() {
  $('zdj-licznik').textContent = `Zdjęcia · ${stan.zdjecia.length}`;
  $('zdjecia').innerHTML = stan.zdjecia.map((z, i) => `<div class="zdj"><img src="${z.url}" alt="Zdjęcie ${i + 1}">
    ${stan.czeka ? '' : `<button type="button" aria-label="Usuń zdjęcie ${i + 1}" data-usun="${i}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D5DAE1" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`}</div>`).join('')
    + (stan.czeka ? '' : `<button type="button" class="plus" id="btn-plus" aria-label="Dodaj kolejne zdjęcie"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`);
  const sz = stan.szacunek;
  $('btn-przelicz').hidden = !sz || stan.czeka;
  $('btn-aparat').disabled = $('btn-galeria').disabled = stan.czeka;
  $('opis').disabled = stan.czeka;
  const glowny = $('btn-glowny');
  glowny.disabled = stan.czeka || (!sz && !stan.zdjecia.length && !$('opis').value.trim());
  glowny.innerHTML = sz && !sz.blad ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>Zatwierdź' : 'Wyślij';

  let w = '';
  if (stan.czeka) {
    w = `<div class="komentarz"><div class="czekam"><div class="kolko" aria-hidden="true"></div><span id="licznik">${esc(stan.czeka)}</span></div>
      <span class="stopka">Zwykle 30–60 sekund. Możesz zostawić telefon — wynik poczeka.</span></div>`;
  } else if (sz && sz.blad) {
    w = `<div class="blad">Nie udało się policzyć: ${esc(sz.blad)}</div>`;
  } else if (sz) {
    const p = sz.pewnosc || 'srednia';
    w = `<div class="komentarz szacunek"><div class="rzad"><span class="glowa" style="font-size:11px;letter-spacing:.1em;color:#4FC3D4;font-weight:700">SZACUNEK · ${esc(sz.nazwa || '')}</span>
      <span class="pewnosc" style="${p === 'wysoka' ? 'color:#7FB89A;background:#13261C' : p === 'srednia' ? 'color:#B6BDC8;background:#23272F' : ''}">PEWNOŚĆ ${p === 'srednia' ? 'ŚREDNIA' : p.toUpperCase()}</span></div>
      ${(sz.pozycje || []).map((x) => `<div class="poz"><span>${esc(x.nazwa)}</span><b>~${liczba(x.kcal)}</b></div>`).join('')}
      <div class="suma"><span class="g" style="font-size:24px;font-weight:700">~${liczba(sz.suma.kcal)} <small style="font-size:13px;font-weight:500;color:#7FAFB6;font-family:Inter">kcal</small></span>
      ${sz.zakres_kcal ? `<span style="font-size:12px;color:#7FAFB6">zakres ${liczba(sz.zakres_kcal[0])}–${liczba(sz.zakres_kcal[1])}</span>` : ''}</div>
      ${chipy(sz.suma)}
      ${sz.data && sz.data !== dzis() ? `<span class="stopka" style="color:#E8A33D">Zapiszę na dzień ${esc(dzienTyg(sz.data))}, ${esc(sz.godzina || '')}.</span>` : ''}
      ${sz.uwaga ? `<span class="stopka">${esc(sz.uwaga)}</span>` : ''}</div>`;
  }
  $('wynik').innerHTML = w;
}

function zmniejsz(plikObrazu) {
  return new Promise((ok, zle) => {
    const img = new Image();
    const url = URL.createObjectURL(plikObrazu);
    img.onload = () => {
      const skala = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * skala); c.height = Math.round(img.height * skala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? ok(b) : zle(new Error('Nie udało się przygotować zdjęcia.'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => zle(new Error('Nie da się odczytać tego zdjęcia.'));
    img.src = url;
  });
}
const base64 = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(blob); });

async function dodajPliki(lista) {
  for (const f of lista) {
    try { const b = await zmniejsz(f); stan.zdjecia.push({ blob: b, url: URL.createObjectURL(b), sciezka: null }); }
    catch (e) { info(e.message, 4000); }
  }
  stan.szacunek = null; // nowe zdjęcie = nowy szacunek
  rysujDodaj();
}

async function wyslij() {
  if (stan.czeka) return;
  if (!stan.id) stan.id = idTeraz();
  const nonce = Math.random().toString(36).slice(2);
  stan.czeka = 'Wysyłam zdjęcia…'; rysujDodaj();
  try {
    let n = 0;
    for (const z of stan.zdjecia) {
      n++;
      if (z.sciezka) continue;
      const sciezka = `zdjecia/${stan.data}/${stan.id}-${Date.now().toString(36)}-${n}.jpg`;
      await wgraj(sciezka, await base64(z.blob));
      z.sciezka = sciezka;
    }
    await zgloszenie(`szacuj ${stan.id}`, JSON.stringify({
      id: stan.id, data: stan.data, godzina: stan.godzina, komentarz: $('opis').value.trim(),
      zdjecia: stan.zdjecia.map((z) => z.sciezka), nonce,
    }));
    const start = Date.now();
    while (Date.now() - start < 5 * 60 * 1000) {
      stan.czeka = `Liczę… ${Math.round((Date.now() - start) / 1000)} s`;
      const el = $('licznik'); if (el) el.textContent = stan.czeka;
      await czekaj(4000);
      const sz = await plik(`szacunki/${stan.id}.json`).catch(() => null);
      if (sz && sz.nonce === nonce) { stan.szacunek = sz; break; }
    }
    if (!stan.szacunek || stan.szacunek.nonce !== nonce) stan.szacunek = { blad: 'automat nie odpowiedział w ciągu 5 minut. Spróbuj jeszcze raz.' };
  } catch (e) {
    stan.szacunek = { blad: e.token ? 'token nie ma dostępu do repozytorium.' : e.message };
  }
  stan.czeka = false; rysujDodaj();
}

let zatwierdzam = false;
async function zatwierdz() {
  if (zatwierdzam) return;                 // drugie stuknięcie nie wysyła drugiego zgłoszenia
  zatwierdzam = true;
  $('btn-glowny').disabled = $('btn-anuluj').disabled = true;
  const id = stan.id, d = stan.szacunek.data || stan.data;
  try { await zgloszenie(`zatwierdz ${id}`); }
  catch (e) { info(e.message, 5000); zatwierdzam = false; $('btn-glowny').disabled = $('btn-anuluj').disabled = false; return; }
  zatwierdzam = false;
  $('btn-anuluj').disabled = false;
  // Od razu pokaż posiłek na karcie (wstępnie), a resztę dociągnij, gdy automat skończy.
  const sz = stan.szacunek;
  const k = karty[d] || pustaKarta(d);
  if (!(k.posilki || []).some((p) => p.id === id)) {
    k.posilki = [...(k.posilki || []), { id, godzina: sz.godzina || stan.godzina, nazwa: sz.nazwa, opis: sz.opis, ...sz.suma,
      pewnosc: sz.pewnosc, zdjecia: sz.zdjecia || [] }];
    k.suma = Object.fromEntries(['kcal', 'b', 'w', 't', 'tn'].map((x) => [x, (k.suma?.[x] || 0) + (sz.suma[x] || 0)]));
  }
  karty[d] = k;
  zamknijDodaj();
  przeliczam = true; rysuj(d === dzis());
  info('Zapisane. Przeliczam kartę…');
  const start = Date.now();
  let posilekJest = false;
  while (Date.now() - start < 4 * 60 * 1000) {
    await czekaj(5000);
    const nowa = await plik(`karty/${d}.json`).catch(() => null);
    if (!nowa || !(nowa.posilki || []).some((p) => p.id === id)) continue;
    const komentarzGotowy = nowa.komentarz_posilkow === nowa.posilki.length;
    if (!posilekJest || komentarzGotowy) { przeliczam = false; karty[d] = nowa; zapamietaj(); rysuj(); }
    posilekJest = true;
    if (komentarzGotowy) { info('Komentarz zaktualizowany', 2500); return; }
    info('Karta przeliczona. Piszę komentarz…');
  }
  przeliczam = false;
  info(posilekJest ? '' : 'Przeliczanie trwa dłużej niż zwykle — odśwież aplikację za chwilę.', 6000);
}

async function anuluj() {
  const cokolwiek = stan.zdjecia.length || $('opis').value.trim() || stan.szacunek;
  if (cokolwiek && !(await zapytaj())) return;
  if (stan.id) zgloszenie(`anuluj ${stan.id}`).catch(() => {});
  zamknijDodaj();
}
function zapytaj() {
  return new Promise((ok) => {
    const dlg = $('pytanie');
    const koniec = (v) => { dlg.close(); ok(v); };
    $('pyt-tak').onclick = () => koniec(true);
    $('pyt-nie').onclick = () => koniec(false);
    dlg.oncancel = () => ok(false);
    dlg.showModal();
  });
}

// ---------- token ----------
function pokazStart(blad) {
  $('start').hidden = false;
  $('token-blad').hidden = !blad; $('token-blad').textContent = blad || '';
}
$('token-zapisz').addEventListener('click', async () => {
  const t = $('token').value.trim();
  if (!t) return;
  pamiec(K.token, t);
  $('token-zapisz').disabled = true;
  try { await odswiez(); $('start').hidden = true; $('token').value = ''; }
  catch (e) { pamiec(K.token, null); pokazStart(e.token ? 'GitHub odmówił dostępu. Token musi mieć dostęp do jedzenie-dane (Contents i Issues: Read and write).' : 'Nie udało się połączyć: ' + e.message); }
  $('token-zapisz').disabled = false;
});

// ---------- zdarzenia ----------
$('btn-dodaj').addEventListener('click', otworzDodaj);
$('btn-aparat').addEventListener('click', () => $('plik-aparat').click());
$('btn-galeria').addEventListener('click', () => $('plik-galeria').click());
for (const id of ['plik-aparat', 'plik-galeria']) {
  $(id).addEventListener('change', (e) => { dodajPliki([...e.target.files]); e.target.value = ''; });
}
$('zdjecia').addEventListener('click', (e) => {
  const u = e.target.closest('[data-usun]');
  if (u) { const [z] = stan.zdjecia.splice(+u.dataset.usun, 1); URL.revokeObjectURL(z.url); stan.szacunek = null; rysujDodaj(); return; }
  if (e.target.closest('#btn-plus')) $('plik-galeria').click();
});
$('opis').addEventListener('input', () => { if (!stan.szacunek) $('btn-glowny').disabled = !stan.zdjecia.length && !$('opis').value.trim(); });
$('btn-przelicz').addEventListener('click', wyslij);
$('btn-glowny').addEventListener('click', () => (stan.szacunek && !stan.szacunek.blad ? zatwierdz() : wyslij()));
$('btn-anuluj').addEventListener('click', anuluj);
document.addEventListener('visibilitychange', () => { if (!document.hidden && pamiec(K.token) && $('dodaj').hidden) odswiez().catch(() => {}); });

// ---------- start ----------
(async function start() {
  try { karty = JSON.parse(pamiec(K.karty) || '{}'); } catch (e) { karty = {}; }
  rysuj(true);
  if (!pamiec(K.token)) { pokazStart(); return; }
  try { await odswiez(); }
  catch (e) { if (e.token) pokazStart('Token wygasł albo stracił dostęp. Wklej nowy.'); else info('Brak połączenia — pokazuję ostatnie zapisane dane.', 4000); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
