"use strict";

const CFG = window.BOARD_CONFIG;
const $ = (id) => document.getElementById(id);
const DATA_URL = "data.enc.json";
const PALETTE = ["#4f8cff", "#f2b84b", "#3ccf91", "#ff7a9c", "#a98bff", "#4fd1e0", "#ff9548"];

// ---------- Speicher (kann in manchen Browsern fehlen) ----------
const store = {
  get(k, fallback = null) {
    try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

let state = { events: [], shopping: null, updated: null, demo: false, error: null };

// ---------- Datum-Helfer ----------
const fmtTime = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const fmtDate = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long" });
const fmtWeekday = new Intl.DateTimeFormat("de-DE", { weekday: "long" });
const fmtShort = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" });
const fmtWdShort = new Intl.DateTimeFormat("de-DE", { weekday: "short" });

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
function parseWhen(s, allDay) {
  if (allDay) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  return new Date(s);
}

function normalize(raw) {
  return raw.map((e) => {
    const start = parseWhen(e.start, e.allDay);
    let end = parseWhen(e.end || e.start, e.allDay);
    if (end <= start) end = e.allDay ? addDays(start, 1) : new Date(start.getTime() + 1);
    return { ...e, start, end };
  });
}

function colorFor(ev) {
  if (ev.label && CFG.labelFarben && CFG.labelFarben[ev.label]) return CFG.labelFarben[ev.label];
  if (ev.color) return ev.color;
  const key = ev.label || ev.title;
  let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function eventsOn(day) {
  const a = startOfDay(day), b = addDays(a, 1);
  return state.events
    .filter((e) => e.start < b && e.end > a)
    .sort((x, y) => (y.allDay - x.allDay) || (x.start - y.start));
}

// ---------- Entschlüsselung (passend zu scripts/prepare.py) ----------
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function decrypt(enc, pass) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: b64(enc.salt), iterations: enc.iter },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(enc.iv) }, key, b64(enc.ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

// ---------- Daten laden ----------
async function loadData() {
  if (store.get("demo")) return useDemo();
  let res;
  try {
    res = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
  } catch {
    return useCache("Offline – zeige gespeicherte Termine");
  }
  if (res.status === 404) return useDemo(true);
  if (!res.ok) return useCache("Server antwortet nicht (" + res.status + ")");

  const pass = store.get("key");
  if (!pass) return showSetup();
  try {
    const enc = await res.json();
    const payload = await decrypt(enc, pass);
    store.set("cache", payload);
    apply(payload, false);
  } catch {
    showSetup("Schlüssel passt nicht zu den Daten. Bitte prüfen.");
  }
}

function useCache(msg) {
  const cached = store.get("cache");
  if (cached) apply(cached, false, msg); else { state.error = msg; render(); }
}

function useDemo(auto = false) {
  apply(demoPayload(), true, auto ? "Noch keine Daten gefunden – Demo-Modus" : null);
}

function apply(payload, demo, error = null) {
  state = { events: normalize(payload.events || []), shopping: payload.shopping || null, updated: payload.updated ? new Date(payload.updated) : null, demo, error };
  render();
}

// ---------- Darstellung ----------
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function whenText(ev, day) {
  if (ev.allDay) return "Ganztägig";
  const a = startOfDay(day), b = addDays(a, 1);
  const s = ev.start < a ? "…" : fmtTime.format(ev.start);
  const e = ev.end > b ? "…" : fmtTime.format(ev.end);
  return ev.end - ev.start <= 1 ? s : `${s} – ${e}`;
}

function renderToday(now) {
  const box = $("today");
  box.replaceChildren();
  const list = eventsOn(now);
  $("today-count").textContent = list.length ? `${list.length} Termin${list.length > 1 ? "e" : ""}` : "";
  if (!list.length) { box.append(el("div", "empty", "Heute steht nichts an.")); return; }
  for (const ev of list) {
    const card = el("article", "event");
    card.style.setProperty("--c", colorFor(ev));
    if (!ev.allDay && ev.end < now) card.classList.add("past");
    if (!ev.allDay && ev.start <= now && ev.end > now) card.classList.add("now");
    card.append(el("div", "when", whenText(ev, now)), el("div", "title", ev.title));
    const meta = el("div", "meta");
    if (ev.label) meta.append(el("span", "who", ev.label));
    if (ev.location) meta.append(el("span", null, "📍 " + ev.location));
    if (meta.childNodes.length) card.append(meta);
    box.append(card);
  }
}

function renderUpcoming(now) {
  const box = $("upcoming");
  box.replaceChildren();
  for (let i = 1; i <= CFG.tageVoraus; i++) {
    const day = addDays(startOfDay(now), i);
    const card = el("section", "day");
    const h = el("h3", null, i === 1 ? "Morgen " : fmtWeekday.format(day) + " ");
    h.append(el("span", null, fmtShort.format(day)));
    card.append(h);
    const list = eventsOn(day);
    if (!list.length) card.append(el("div", "none", "—"));
    else {
      const ul = el("ul");
      for (const ev of list) {
        const li = el("li");
        li.style.setProperty("--c", colorFor(ev));
        li.append(el("span", "dot"));
        if (!ev.allDay) li.append(el("span", "t", fmtTime.format(ev.start < day ? day : ev.start)));
        li.append(el("span", null, ev.title));
        ul.append(li);
      }
      card.append(ul);
    }
    box.append(card);
  }
}

function renderStatus(now) {
  const bar = document.querySelector(".status");
  let text, warn = false;
  if (state.demo) { text = state.error || "Demo-Modus – Beispieltermine"; }
  else if (state.updated) {
    const min = Math.round((now - state.updated) / 60000);
    text = "TimeTree aktualisiert " + (min < 1 ? "gerade eben" : min < 60 ? `vor ${min} Min.` : `vor ${Math.floor(min / 60)} Std. ${min % 60} Min.`);
    if (min > CFG.warnungNachMinuten) { warn = true; text += " – Abholdienst prüfen"; }
    if (state.error) { warn = true; text = state.error + " · " + text; }
  } else { text = state.error || "Keine Daten"; warn = !!state.error; }
  $("status-text").textContent = text;
  bar.classList.toggle("warn", warn);
}

function render() {
  const now = new Date();
  renderToday(now);
  renderUpcoming(now);
  renderShop();
  renderStatus(now);
}

function tick() {
  const now = new Date();
  $("time").textContent = fmtTime.format(now);
  $("date").textContent = fmtDate.format(now);
  const h = now.getHours();
  const night = CFG.nachtVon > CFG.nachtBis ? (h >= CFG.nachtVon || h < CFG.nachtBis) : (h >= CFG.nachtVon && h < CFG.nachtBis);
  document.body.classList.toggle("night", night);
}

// ---------- Wetter (Open-Meteo, ohne API-Schlüssel) ----------
const WMO = [
  [[0], "☀️", "Klar"], [[1], "🌤️", "Überwiegend klar"], [[2], "⛅", "Teils bewölkt"], [[3], "☁️", "Bedeckt"],
  [[45, 48], "🌫️", "Nebel"], [[51, 53, 55, 56, 57], "🌦️", "Nieselregen"], [[61, 63, 65, 66, 67], "🌧️", "Regen"],
  [[71, 73, 75, 77], "🌨️", "Schnee"], [[80, 81, 82], "🌦️", "Schauer"], [[85, 86], "🌨️", "Schneeschauer"],
  [[95, 96, 99], "⛈️", "Gewitter"],
];
const wmo = (c) => WMO.find(([codes]) => codes.includes(c)) || [[], "·", ""];

async function loadWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${CFG.lat}&longitude=${CFG.lon}` +
    "&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=Europe%2FBerlin&forecast_days=4";
  try {
    const d = await (await fetch(url)).json();
    const [, icon, text] = wmo(d.current.weather_code);
    $("w-icon").textContent = icon;
    $("w-temp").textContent = Math.round(d.current.temperature_2m) + "°";
    $("w-text").textContent = `${text}\n${CFG.ort}`;
    const days = $("w-days");
    days.replaceChildren();
    for (let i = 1; i <= 3; i++) {
      const box = el("div", "w-day");
      box.append(el("b", null, fmtWdShort.format(new Date(d.daily.time[i]))), el("span", "ic", wmo(d.daily.weather_code[i])[1]),
        el("span", null, `${Math.round(d.daily.temperature_2m_max[i])}° / ${Math.round(d.daily.temperature_2m_min[i])}°`));
      if (d.daily.precipitation_probability_max[i] >= 30) box.append(el("div", null, `💧 ${d.daily.precipitation_probability_max[i]} %`));
      days.append(box);
    }
  } catch {
    $("w-text").textContent = "Wetter nicht erreichbar";
  }
}

// ---------- Einkaufsliste (aus Bring!, nur Anzeige) ----------
function renderShop() {
  const shop = state.shopping;
  const ul = $("shop-list");
  ul.replaceChildren();
  $("shop-name").textContent = shop && shop.list ? "· " + shop.list : "";
  if (!shop) { ul.append(el("li", "none", "Keine Bring!-Liste verbunden")); return; }
  if (!shop.items.length) { ul.append(el("li", "none", "Alles erledigt 🎉")); return; }
  for (const it of shop.items) {
    const li = el("li", it.urgent ? "urgent" : null);
    li.append(el("span", "name", it.name));
    if (it.spec) li.append(el("span", "spec", it.spec));
    ul.append(li);
  }
}

// ---------- Einrichtung ----------
function showSetup(error) {
  $("setup").hidden = false;
  $("setup-error").hidden = !error;
  $("setup-error").textContent = error || "";
}
$("setup-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("setup-key").value;
  if (v.length < 12) return showSetup("Der Schlüssel hat mindestens 12 Zeichen.");
  store.set("key", v); store.del("demo");
  $("setup").hidden = true; $("setup-key").value = "";
  loadData();
});
$("setup-demo").addEventListener("click", () => { store.set("demo", true); $("setup").hidden = true; useDemo(); });
$("settings-btn").addEventListener("click", () => { store.del("demo"); showSetup(); });

// ---------- Demo-Daten ----------
function demoPayload() {
  const t = startOfDay(new Date());
  const at = (d, h, m = 0) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + d, h, m).toISOString();
  const day = (d) => { const x = addDays(t, d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  const E = (title, label, s, e, extra = {}) => ({ title, label, start: s, end: e, allDay: false, ...extra });
  return {
    updated: new Date().toISOString(),
    events: [
      E("Kita – Laternenbasteln", "Kind", at(0, 9), at(0, 11)),
      E("Dienst", "Papa", at(0, 7, 30), at(0, 16, 30)),
      E("Zahnarzt", "Mama", at(0, 15), at(0, 15, 45), { location: "Eschweiler" }),
      E("Abendessen bei Oma", "Familie", at(0, 18, 30), at(0, 20, 30)),
      E("Schwimmkurs", "Kind", at(1, 16), at(1, 17)),
      E("Training", "Papa", at(1, 19), at(1, 20, 30)),
      { title: "Müllabfuhr Gelbe Tonne", label: "Familie", start: day(2), end: day(3), allDay: true },
      E("Elternabend", "Mama", at(2, 19, 30), at(2, 21)),
      E("Auto in die Werkstatt", "Papa", at(3, 8), at(3, 9)),
      E("Kindergeburtstag Lina", "Kind", at(4, 14), at(4, 17)),
      { title: "Wochenende bei den Großeltern", label: "Familie", start: day(5), end: day(7), allDay: true },
    ],
    shopping: {
      list: "Zuhause",
      items: [
        { name: "Windeln", spec: "Größe 5", urgent: true },
        { name: "Milch", spec: "2 Liter", urgent: false },
        { name: "Brot", spec: "", urgent: false },
        { name: "Bananen", spec: "", urgent: false },
        { name: "Kaffee", spec: "Bohnen", urgent: false },
      ],
    },
  };
}

// ---------- Bildschirm wach halten, Offline-Fähigkeit ----------
async function keepAwake() {
  try { if ("wakeLock" in navigator) await navigator.wakeLock.request("screen"); } catch {}
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { keepAwake(); loadData(); } });
document.addEventListener("click", keepAwake, { once: true });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

// ---------- Start ----------
tick(); loadData(); loadWeather(); keepAwake();
setInterval(tick, 1000);
setInterval(render, 60 * 1000);
setInterval(loadData, 5 * 60 * 1000);
setInterval(loadWeather, 30 * 60 * 1000);
