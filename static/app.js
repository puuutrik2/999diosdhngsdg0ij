const el = (id) => document.getElementById(id);

const STORAGE = {
  lastSteam: "steamStatusSite:lastSteam",
  auto: "steamStatusSite:auto",
  intervalSec: "steamStatusSite:intervalSec",
  watchlist: "steamStatusSite:watchlist",
  presencePrefix: "steamStatusSite:presence:",
  snapshotPrefix: "steamStatusSite:snap:",
  history: "steamStatusSite:history",
  notif: "steamStatusSite:notif",
  sound: "steamStatusSite:sound",
  webhookUrl: "steamStatusSite:webhookUrl",
  webhookEnabled: "steamStatusSite:webhookEnabled",
  themeAccent: "steamStatusSite:themeAccent",
  themeHot: "steamStatusSite:themeHot",
};

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const toast = (msg) => {
  const t = el("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
};

const setPill = (state, text) => {
  const dot = el("dot");
  const pillText = el("pillText");
  if (!dot || !pillText) return;
  pillText.textContent = text;
  if (state === "ok") {
    dot.style.background = "var(--ok)";
    dot.style.boxShadow = "0 0 0 4px rgba(89, 209, 125, 0.10)";
  } else if (state === "bad") {
    dot.style.background = "var(--bad)";
    dot.style.boxShadow = "0 0 0 4px rgba(154, 167, 181, 0.10)";
  } else {
    dot.style.background = "var(--warn)";
    dot.style.boxShadow = "0 0 0 4px rgba(255, 191, 60, 0.12)";
  }
};

const statusClass = (personastate) => {
  switch (personastate) {
    case 0:
      return "offline";
    case 1:
      return "online";
    case 2:
      return "busy";
    case 3:
      return "away";
    case 4:
      return "snooze";
    case 5:
      return "trade";
    case 6:
      return "play";
    default:
      return "unknown";
  }
};

const dotClass = (cls) => {
  if (cls === "online") return "ok";
  if (cls === "busy") return "busy";
  if (cls === "away" || cls === "snooze") return "away";
  if (cls === "trade" || cls === "play") return "trade";
  if (cls === "offline") return "";
  return "";
};

const fmtCountry = (code) => {
  if (!code) return null;
  try {
    if (typeof Intl !== "undefined" && Intl.DisplayNames) {
      const dn = new Intl.DisplayNames(["ru"], { type: "region" });
      return dn.of(code) || code;
    }
  } catch {}
  return code;
};

const fmtRelative = (unixSeconds) => {
  if (!unixSeconds) return null;
  const ts = unixSeconds * 1000;
  const diffMs = Date.now() - ts;
  const diffSec = Math.round(diffMs / 1000);
  const abs = new Date(ts).toLocaleString();
  if (!isFinite(diffSec)) return abs;

  const rtf = (() => {
    try {
      return new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
    } catch {
      return null;
    }
  })();

  const units = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];

  for (const [unit, seconds] of units) {
    if (Math.abs(diffSec) >= seconds || unit === "second") {
      const value = Math.round(-diffSec / seconds);
      const rel = rtf ? rtf.format(value, unit) : null;
      return rel ? `${rel} (${abs})` : abs;
    }
  }
  return abs;
};

const fmtRelativeMs = (ms) => {
  if (!ms) return null;
  return fmtRelative(Math.floor(ms / 1000));
};

const fmtDuration = (ms) => {
  const totalSec = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
};

const skeletonHtml = () => `
  <div class="profile profile--skeleton">
    <div class="avatar sk sk-avatar"></div>
    <div class="info sk-wrap">
      <div class="sk sk-line w60"></div>
      <div class="sk sk-line w42"></div>
      <div class="sk-row">
        <div class="sk sk-pill w28"></div>
        <div class="sk sk-pill w50"></div>
      </div>
      <div class="sk-grid">
        <div class="sk sk-line w40"></div>
        <div class="sk sk-line w55"></div>
        <div class="sk sk-line w35"></div>
      </div>
    </div>
    <div class="actions">
      <div class="sk sk-btn w24"></div>
      <div class="sk sk-btn w24"></div>
    </div>
  </div>
`;

const clampInterval = (s) => {
  const n = Number(s);
  if (!isFinite(n)) return 15;
  return Math.min(60, Math.max(5, Math.round(n)));
};

const getPresenceKey = (steamid64) => `${STORAGE.presencePrefix}${steamid64}`;

const updatePresenceMeta = (p) => {
  const steamid64 = String(p?.steamid64 || "");
  if (!steamid64) return null;

  const now = Date.now();
  const key = getPresenceKey(steamid64);
  const prev = safeJsonParse(localStorage.getItem(key) || "null") || {};
  const prevOnline = typeof prev.online === "boolean" ? prev.online : null;
  const currentOnline = Number(p.personastate ?? 0) !== 0;

  let detectedOnlineAt = typeof prev.detectedOnlineAt === "number" ? prev.detectedOnlineAt : null;
  let detectedOfflineAt = typeof prev.detectedOfflineAt === "number" ? prev.detectedOfflineAt : null;

  if (prevOnline === null) {
    if (currentOnline) detectedOnlineAt = now;
    else detectedOfflineAt = now;
  } else if (prevOnline !== currentOnline) {
    if (currentOnline) detectedOnlineAt = now;
    else detectedOfflineAt = now;
  }

  const next = {
    online: currentOnline,
    detectedOnlineAt,
    detectedOfflineAt,
    updatedAt: now,
  };
  localStorage.setItem(key, JSON.stringify(next));
  const snap = safeJsonParse(localStorage.getItem(getSnapshotKey(steamid64)) || "null") || {};
  const gameStartAt = typeof snap.gameStartAt === "number" ? snap.gameStartAt : null;
  return { ...next, gameStartAt };
};

const mkDetail = (label, valueNode) => {
  const d = document.createElement("div");
  d.className = "detail";
  const l = document.createElement("div");
  l.className = "detail__label";
  l.textContent = label;
  const v = document.createElement("div");
  v.className = "detail__value";
  if (valueNode instanceof Node) v.appendChild(valueNode);
  else v.textContent = String(valueNode ?? "");
  d.appendChild(l);
  d.appendChild(v);
  return d;
};

const renderProfile = (p, meta = null, opts = {}) => {
  const row = document.createElement("div");
  row.className = "profile appear";

  if (p.gameid) {
    const hero = document.createElement("div");
    hero.className = "gameHero";
    hero.style.backgroundImage = `url(https://cdn.cloudflare.steamstatic.com/steam/apps/${p.gameid}/header.jpg)`;
    row.appendChild(hero);
  }

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  const img = document.createElement("img");
  img.src = p.avatarfull || p.avatarmedium || p.avatar || "";
  img.alt = "avatar";
  avatar.appendChild(img);

  const info = document.createElement("div");
  info.style.minWidth = "0";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = p.personaname || p.steamid64;

  const badges = document.createElement("div");
  badges.className = "badges";

  const st = statusClass(p.personastate);

  const b1 = document.createElement("span");
  b1.className = `badge badge--status status-${st}`;
  const s = document.createElement("span");
  s.className = "s " + dotClass(st);
  const t1 = document.createElement("span");
  t1.className = `statusText status-${st}`;
  t1.textContent = p.personastate_label || "Unknown";
  b1.appendChild(s);
  b1.appendChild(t1);

  const b2 = document.createElement("span");
  b2.className = "badge badge--game";
  const gameName = p.gameextrainfo || (p.gameid ? `appid ${p.gameid}` : "—");
  if (p.gameid || p.gameextrainfo) {
    b2.classList.add("playing");
    b2.textContent = `Играет: ${gameName}`;
  } else {
    b2.textContent = "Игра: —";
  }

  badges.appendChild(b1);
  badges.appendChild(b2);

  const details = document.createElement("div");
  details.className = "details";

  const steamIdLine = document.createElement("div");
  steamIdLine.className = "idline";
  const idText = document.createElement("span");
  idText.textContent = p.steamid64;
  const copyBtn = document.createElement("button");
  copyBtn.className = "copyBtn";
  copyBtn.type = "button";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(String(p.steamid64));
      toast("Скопировано SteamID64");
    } catch {
      toast("Не удалось скопировать");
    }
  });
  steamIdLine.appendChild(idText);
  steamIdLine.appendChild(copyBtn);
  details.appendChild(mkDetail("SteamID64", steamIdLine));

  const countryName = fmtCountry(p.loccountrycode);
  if (countryName) details.appendChild(mkDetail("Страна", countryName));

  const last = fmtRelative(p.lastlogoff);
  if (last) details.appendChild(mkDetail("Последний выход", last));

  if ((p.gameid || p.gameextrainfo) && meta?.gameStartAt) {
    const span = document.createElement("span");
    span.className = "playDuration";
    span.dataset.start = String(meta.gameStartAt);
    span.textContent = fmtDuration(Date.now() - Number(meta.gameStartAt));
    details.appendChild(mkDetail("В игре (обнаружено)", span));
  }

  if (meta?.detectedOnlineAt) {
    const v = fmtRelativeMs(meta.detectedOnlineAt);
    if (v) details.appendChild(mkDetail("В сети с (обнаружено)", v));
  }

  if (meta?.detectedOfflineAt) {
    const v = fmtRelativeMs(meta.detectedOfflineAt);
    if (v) details.appendChild(mkDetail("Вышел (обнаружено)", v));
  }

  if (meta?.updatedAt) {
    details.appendChild(mkDetail("Обновлено", new Date(meta.updatedAt).toLocaleString()));
  }

  if (p.gameid) {
    const appLine = document.createElement("div");
    appLine.className = "idline";
    const appid = document.createElement("span");
    appid.textContent = String(p.gameid);
    const storeLink = document.createElement("a");
    storeLink.className = "link";
    storeLink.href = `https://store.steampowered.com/app/${p.gameid}/`;
    storeLink.target = "_blank";
    storeLink.rel = "noreferrer";
    storeLink.textContent = "Магазин";
    appLine.appendChild(appid);
    appLine.appendChild(storeLink);
    details.appendChild(mkDetail("AppID", appLine));
  }

  info.appendChild(name);
  info.appendChild(badges);
  info.appendChild(details);

  const actions = document.createElement("div");
  actions.className = "actions";
  const profileBtn = document.createElement("a");
  profileBtn.className = "actionBtn";
  profileBtn.href = p.profile_url;
  profileBtn.target = "_blank";
  profileBtn.rel = "noreferrer";
  profileBtn.textContent = "Профиль";
  actions.appendChild(profileBtn);

  if (p.gameid) {
    const storeBtn = document.createElement("a");
    storeBtn.className = "actionBtn actionBtn2";
    storeBtn.href = `https://store.steampowered.com/app/${p.gameid}/`;
    storeBtn.target = "_blank";
    storeBtn.rel = "noreferrer";
    storeBtn.textContent = "Store";
    actions.appendChild(storeBtn);
  }

  if (opts?.onRemove) {
    const removeBtn = document.createElement("button");
    removeBtn.className = "actionBtn actionBtnDanger";
    removeBtn.type = "button";
    removeBtn.textContent = "Удалить";
    removeBtn.addEventListener("click", () => opts.onRemove(p.steamid64));
    actions.appendChild(removeBtn);
  }

  row.appendChild(avatar);
  row.appendChild(info);
  row.appendChild(actions);
  return row;
};

const renderMissing = (steamid64) => {
  const box = document.createElement("div");
  box.className = "empty muted";
  box.textContent = `Нет данных по SteamID64: ${steamid64}`;
  return box;
};

// ---- History + notifications ----
const HISTORY_MAX = 500;
const HISTORY_SHOW = 60;

let history = [];
let notifEnabled = false;
let soundEnabled = false;
let webhookUrl = "";
let webhookEnabled = false;
let audioCtx = null;

const getSnapshotKey = (steamid64) => `${STORAGE.snapshotPrefix}${steamid64}`;

const loadHistory = () => {
  const raw = safeJsonParse(localStorage.getItem(STORAGE.history) || "[]");
  return Array.isArray(raw) ? raw : [];
};

const saveHistory = () => {
  localStorage.setItem(STORAGE.history, JSON.stringify(history.slice(-HISTORY_MAX)));
};

const pushHistory = (evt) => {
  history.push(evt);
  if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
  saveHistory();
};

const renderHistory = () => {
  const box = el("history");
  if (!box) return;
  if (!history.length) {
    box.innerHTML = `<div class="empty muted">Пока нет событий.</div>`;
    return;
  }
  box.innerHTML = "";
  const last = history.slice(-HISTORY_SHOW).reverse();
  for (const evt of last) {
    const item = document.createElement("div");
    item.className = "historyItem";
    const time = document.createElement("div");
    time.className = "historyTime";
    time.textContent = new Date(evt.ts).toLocaleString();
    const text = document.createElement("div");
    text.className = "historyText";
    text.textContent = evt.text;
    item.appendChild(time);
    item.appendChild(text);
    box.appendChild(item);
  }
};

const playBeep = async () => {
  if (!soundEnabled) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === "suspended") await audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch {}
};

const notifyBrowser = (title, body, icon) => {
  if (!notifEnabled) return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: icon || undefined });
  } catch {}
};

const sendDiscordWebhook = async (content) => {
  if (!webhookEnabled) return;
  const url = String(webhookUrl || "").trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: String(content || "").slice(0, 1900) }),
    });
  } catch (e) {
    toast(`Discord webhook: ${e?.message ? String(e.message) : "ошибка"}`);
  }
};

const detectEvents = (p) => {
  const sid = String(p?.steamid64 || "").trim();
  if (!sid) return [];
  const now = Date.now();

  const current = {
    online: Number(p.personastate ?? 0) !== 0,
    gameid: p.gameid ? String(p.gameid) : "",
    game: p.gameextrainfo ? String(p.gameextrainfo) : "",
    personaname: p.personaname ? String(p.personaname) : sid,
  };

  const key = getSnapshotKey(sid);
  const prev = safeJsonParse(localStorage.getItem(key) || "null");
  const prevGameKey = prev ? String(prev.gameid || prev.game || "") : "";
  const curGameKey = String(current.gameid || current.game || "");
  const wasPlaying = Boolean(prevGameKey);
  const isPlaying = Boolean(curGameKey);

  let gameStartAt = null;
  if (isPlaying) {
    if (prevGameKey && prevGameKey === curGameKey && typeof prev.gameStartAt === "number") gameStartAt = prev.gameStartAt;
    else gameStartAt = now;
  }

  const next = { ...current, gameStartAt, lastSeenAt: now };
  localStorage.setItem(key, JSON.stringify(next));
  if (!prev) return [];

  const events = [];
  if (typeof prev.online === "boolean" && prev.online !== current.online) {
    events.push({
      ts: now,
      steamid64: sid,
      type: current.online ? "online" : "offline",
      text: current.online ? `${current.personaname} в сети` : `${current.personaname} вышел`,
      icon: p.avatarfull || p.avatarmedium || p.avatar || "",
    });
  }

  if (wasPlaying !== isPlaying) {
    if (isPlaying) {
      const g = current.game || (current.gameid ? `appid ${current.gameid}` : "игра");
      events.push({
        ts: now,
        steamid64: sid,
        type: "game_start",
        text: `${current.personaname} играет: ${g}`,
        icon: p.avatarfull || p.avatarmedium || p.avatar || "",
      });
    } else {
      const g = prev.game || (prev.gameid ? `appid ${prev.gameid}` : "игра");
      const dur = typeof prev.gameStartAt === "number" ? ` (${fmtDuration(now - prev.gameStartAt)})` : "";
      events.push({
        ts: now,
        steamid64: sid,
        type: "game_end",
        text: `${current.personaname} перестал играть: ${g}${dur}`,
        icon: p.avatarfull || p.avatarmedium || p.avatar || "",
      });
    }
  } else if (isPlaying) {
    if (prevGameKey && curGameKey && prevGameKey !== curGameKey) {
      const g1 = prev.game || (prev.gameid ? `appid ${prev.gameid}` : "—");
      const g2 = current.game || (current.gameid ? `appid ${current.gameid}` : "—");
      const dur = typeof prev.gameStartAt === "number" ? ` (${fmtDuration(now - prev.gameStartAt)})` : "";
      events.push({
        ts: now,
        steamid64: sid,
        type: "game_change",
        text: `${current.personaname} сменил игру: ${g1}${dur} → ${g2}`,
        icon: p.avatarfull || p.avatarmedium || p.avatar || "",
      });
    }
  }

  return events;
};

const handleEvents = async (events) => {
  if (!events.length) return;
  for (const evt of events) {
    pushHistory(evt);
    notifyBrowser(evt.text, evt.text, evt.icon);
    await playBeep();
    await sendDiscordWebhook(evt.text);
  }
  renderHistory();
};

// ---- Theme ----
const DEFAULT_ACCENT = "#66c0f4";
const DEFAULT_HOT = "#ff4d4d";
let themeAccent = "";
let themeHot = "";

const applyTheme = () => {
  const root = document.documentElement;
  if (!root) return;
  if (themeAccent) root.style.setProperty("--steam-accent", themeAccent);
  else root.style.removeProperty("--steam-accent");
  if (themeHot) root.style.setProperty("--hot", themeHot);
  else root.style.removeProperty("--hot");
};

// ---- State ----
let autoTimeout = null;
let tickTimer = null;
let nextRefreshAt = null;
let lastUpdatedAt = null;
let errorStreak = 0;
let inFlight = false;
let autoEnabled = true;
let intervalSec = 15;
let preview = null; // last /api/lookup result
let watchlist = []; // [{steamid64, addedAt}]

// ---- Storage ----
const loadWatchlist = () => {
  const raw = safeJsonParse(localStorage.getItem(STORAGE.watchlist) || "[]");
  const out = [];
  const seen = new Set();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") {
        const sid = item.trim();
        if (sid && !seen.has(sid)) {
          out.push({ steamid64: sid, addedAt: Date.now() });
          seen.add(sid);
        }
      } else if (item && typeof item === "object") {
        const sid = String(item.steamid64 || "").trim();
        if (sid && !seen.has(sid)) {
          out.push({ steamid64: sid, addedAt: Number(item.addedAt) || Date.now() });
          seen.add(sid);
        }
      }
    }
  }
  return out;
};

const saveWatchlist = () => {
  localStorage.setItem(STORAGE.watchlist, JSON.stringify(watchlist));
};

// ---- UI ----
const setMeta = (text) => {
  const m = el("meta");
  if (!m) return;
  m.textContent = text || "";
};

const refreshMeta = (updatedAt = null) => {
  if (updatedAt) lastUpdatedAt = updatedAt;
  const parts = [];
  parts.push(`Авто: ${autoEnabled ? "вкл" : "выкл"}`);
  parts.push(`Интервал: ${intervalSec}с`);
  if (watchlist.length) parts.push(`В списке: ${watchlist.length}`);
  if (lastUpdatedAt) parts.push(`Обновлено: ${new Date(lastUpdatedAt).toLocaleTimeString()}`);
  if (autoEnabled && nextRefreshAt && !document.hidden) {
    const sec = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
    parts.push(`Следующее: ${sec}с`);
  }
  if (errorStreak) parts.push(`ошибки: ${errorStreak}`);
  setMeta(parts.join(" • "));
};

const updatePlayDurations = () => {
  const spans = document.querySelectorAll(".playDuration");
  for (const span of spans) {
    const start = Number(span.dataset?.start);
    if (!isFinite(start) || start <= 0) continue;
    span.textContent = fmtDuration(Date.now() - start);
  }
};

const renderPreview = (data, presence) => {
  const result = el("result");
  if (!result) return;
  if (!data) {
    result.innerHTML = `<div class="empty muted">Пока пусто. Вставь ссылку и нажми Check.</div>`;
    return;
  }
  result.innerHTML = "";
  result.appendChild(renderProfile(data, presence));
};

const renderWatchGrid = (playersById) => {
  const grid = el("watchGrid");
  if (!grid) return;

  if (!watchlist.length) {
    grid.innerHTML = `<div class="empty muted">Список пуст. Нажми “В список”, чтобы начать следить.</div>`;
    return;
  }

  if (playersById && playersById.size === 0) {
    grid.innerHTML = watchlist.map(() => skeletonHtml()).join("");
    return;
  }

  grid.innerHTML = "";
  for (const item of watchlist) {
    const p = playersById?.get?.(item.steamid64);
    if (!p) {
      grid.appendChild(renderMissing(item.steamid64));
      continue;
    }
    const presence = updatePresenceMeta(p);
    grid.appendChild(renderProfile(p, presence, { onRemove: (sid) => removeFromWatchlist(sid) }));
  }
};

// ---- API ----
const safeReadJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const postJson = async (url, payload) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await safeReadJson(res)) || {};
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
};

// ---- Actions ----
const getActiveIds = () => {
  const ids = new Set();
  for (const item of watchlist) ids.add(item.steamid64);
  const sid = String(preview?.steamid64 || "").trim();
  if (sid) ids.add(sid);
  return Array.from(ids);
};

const stopAutoRefresh = () => {
  if (autoTimeout) {
    clearTimeout(autoTimeout);
    autoTimeout = null;
  }
  nextRefreshAt = null;
  errorStreak = 0;
  refreshMeta();
};

const scheduleAutoRefresh = (delaySec) => {
  if (!autoEnabled) return;
  if (document.hidden) return;
  const ids = getActiveIds();
  if (!ids.length) return;

  const delayMs = Math.max(0, Math.floor(Number(delaySec ?? intervalSec) * 1000));
  nextRefreshAt = Date.now() + delayMs;
  refreshMeta();

  if (autoTimeout) clearTimeout(autoTimeout);
  autoTimeout = setTimeout(async () => {
    autoTimeout = null;
    const ok = await refreshActive({ fresh: true, quiet: true, fromAuto: true });
    if (ok !== false) {
      errorStreak = 0;
      scheduleAutoRefresh(intervalSec);
    } else {
      errorStreak = Math.min(errorStreak + 1, 5);
      const backoff = Math.min(60, intervalSec * Math.pow(2, errorStreak));
      scheduleAutoRefresh(backoff);
    }
  }, delayMs);
};

const startAutoRefresh = () => {
  stopAutoRefresh();
  if (!autoEnabled) return;
  const ids = getActiveIds();
  if (!ids.length) return;
  scheduleAutoRefresh(intervalSec);
};

const refreshActive = async ({ fresh, quiet, fromAuto }) => {
  const ids = getActiveIds();
  if (!ids.length) return;
  if (inFlight) return;
  inFlight = true;

  if (!quiet) setPill("warn", "loading…");
  else setPill("warn", "обновляю…");

  if (!quiet) renderWatchGrid(new Map());

  try {
    const data = await postJson("/api/summaries", { steamid64s: ids, fresh: Boolean(fresh) });
    const players = Array.isArray(data.players) ? data.players : [];
    const playersById = new Map();
    for (const p of players) {
      if (p && typeof p === "object" && p.steamid64) playersById.set(String(p.steamid64), p);
    }

    const events = [];
    for (const p of players) events.push(...detectEvents(p));
    await handleEvents(events);

    // Update preview if present
    let updatedAt = Date.now();
    if (preview?.steamid64 && playersById.has(String(preview.steamid64))) {
      const next = playersById.get(String(preview.steamid64));
      preview = { ...preview, ...next };
      const presence = updatePresenceMeta(preview);
      updatedAt = presence?.updatedAt || updatedAt;
      renderPreview(preview, presence);

      const st = statusClass(preview.personastate);
      const pillState = st === "offline" ? "bad" : "ok";
      setPill(pillState, preview.personastate_label || "ok");
    } else if (watchlist.length) {
      const anyOnline = watchlist.some((x) => Number(playersById.get(x.steamid64)?.personastate ?? 0) !== 0);
      setPill(anyOnline ? "ok" : "bad", anyOnline ? "есть онлайн" : "все офф");
    }

    renderWatchGrid(playersById);
    refreshMeta(updatedAt);
    return true;
  } catch (e) {
    const msg = e?.message ? String(e.message) : "Unknown error";
    setPill("bad", "error");
    refreshMeta();
    if (!fromAuto) toast(msg);
    return false;
  } finally {
    inFlight = false;
  }
};

const lookupPreview = async (steamValue) => {
  const v = String(steamValue || "").trim();
  if (!v) return;

  localStorage.setItem(STORAGE.lastSteam, v);

  const result = el("result");
  if (result) result.innerHTML = skeletonHtml();
  setPill("warn", "loading…");

  try {
    const data = await postJson("/api/lookup", { steam: v, fresh: true });
    preview = data;
    setSteamParamInUrl(preview?.steamid64 || v);
    await handleEvents(detectEvents(preview));
    const presence = updatePresenceMeta(preview);
    renderPreview(preview, presence);

    const st = statusClass(preview.personastate);
    const pillState = st === "offline" ? "bad" : "ok";
    setPill(pillState, preview.personastate_label || "ok");
    refreshMeta(presence?.updatedAt || Date.now());

    startAutoRefresh();
  } catch (e) {
    const msg = e?.message ? String(e.message) : "Unknown error";
    if (result) result.innerHTML = `<div class="empty muted">Ошибка: ${msg}</div>`;
    setPill("bad", "error");
    toast(msg);
  }
};

const addPreviewToWatchlist = async () => {
  const input = el("steamInput");
  const v = String(input?.value || "").trim();
  if (!v) return;

  if (!preview || !preview.steamid64) {
    await lookupPreview(v);
  }

  const sid = String(preview?.steamid64 || "").trim();
  if (!sid) return;

  if (!watchlist.some((x) => x.steamid64 === sid)) {
    watchlist.push({ steamid64: sid, addedAt: Date.now() });
    saveWatchlist();
    toast("Добавлено в watchlist");
  } else {
    toast("Уже в watchlist");
  }
  startAutoRefresh();
  refreshActive({ fresh: true, quiet: true });
};

const removeFromWatchlist = (steamid64) => {
  const sid = String(steamid64 || "").trim();
  if (!sid) return;
  watchlist = watchlist.filter((x) => x.steamid64 !== sid);
  saveWatchlist();
  refreshMeta();
  startAutoRefresh();
  if (watchlist.length || preview?.steamid64) refreshActive({ fresh: true, quiet: true });
  else renderWatchGrid(new Map());
};

const clearWatchlist = () => {
  if (!watchlist.length) return;
  if (!window.confirm("Очистить watchlist?")) return;
  watchlist = [];
  saveWatchlist();
  renderWatchGrid(new Map());
  refreshMeta();
  startAutoRefresh();
};

const clearPreview = () => {
  preview = null;
  const input = el("steamInput");
  if (input) input.value = "";
  localStorage.removeItem(STORAGE.lastSteam);
  renderPreview(null, null);
  refreshMeta();
  setPill("ok", "ready");
  if (!watchlist.length) stopAutoRefresh();
};

const exportWatchlist = () => {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    watchlist,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "steam-watchlist.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

const importWatchlistJson = (data) => {
  const list = Array.isArray(data) ? data : data?.watchlist;
  if (!Array.isArray(list)) throw new Error("Неверный формат JSON");

  const toIds = [];
  for (const item of list) {
    if (typeof item === "string") {
      const sid = item.trim();
      if (sid) toIds.push(sid);
    } else if (item && typeof item === "object") {
      const sid = String(item.steamid64 || "").trim();
      if (sid) toIds.push(sid);
    }
  }

  const seen = new Set(watchlist.map((x) => x.steamid64));
  let added = 0;
  for (const sid of toIds) {
    if (seen.has(sid)) continue;
    watchlist.push({ steamid64: sid, addedAt: Date.now() });
    seen.add(sid);
    added += 1;
  }
  saveWatchlist();
  refreshMeta();
  renderWatchGrid(new Map());
  toast(added ? `Импортировано: ${added}` : "Импорт: ничего нового");
  if (watchlist.length) refreshActive({ fresh: true, quiet: false });
};

const clearHistory = () => {
  if (!window.confirm("Очистить историю?")) return;
  history = [];
  localStorage.removeItem(STORAGE.history);
  renderHistory();
  toast("История очищена");
};

const requestNotifPermission = async () => {
  if (typeof Notification === "undefined") {
    toast("Уведомления не поддерживаются в этом браузере");
    return false;
  }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const p = await Notification.requestPermission();
    return p === "granted";
  } catch {
    return false;
  }
};

const setSteamParamInUrl = (steamValue) => {
  const v = String(steamValue || "").trim();
  if (!v) return;
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("steam", v);
    window.history.replaceState(null, "", u);
  } catch {}
};

// ---- Events ----
el("goBtn")?.addEventListener("click", () => lookupPreview(el("steamInput")?.value));
el("steamInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") lookupPreview(el("steamInput")?.value);
});
el("addBtn")?.addEventListener("click", addPreviewToWatchlist);
el("clearBtn")?.addEventListener("click", clearPreview);
el("watchClearBtn")?.addEventListener("click", clearWatchlist);
el("exportBtn")?.addEventListener("click", exportWatchlist);
el("importFile")?.addEventListener("change", async (e) => {
  const file = e.target?.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    importWatchlistJson(JSON.parse(text));
  } catch (err) {
    toast(`Import: ${err?.message ? String(err.message) : "ошибка"}`);
  }
});
el("clearHistoryBtn")?.addEventListener("click", clearHistory);

el("notifToggle")?.addEventListener("change", async (e) => {
  const enabled = Boolean(e.target?.checked);
  if (enabled) {
    const ok = await requestNotifPermission();
    if (!ok) {
      e.target.checked = false;
      toast("Разрешение на уведомления не выдано");
      notifEnabled = false;
      localStorage.setItem(STORAGE.notif, "0");
      return;
    }
  }
  notifEnabled = enabled;
  localStorage.setItem(STORAGE.notif, enabled ? "1" : "0");
});

el("soundToggle")?.addEventListener("change", async (e) => {
  soundEnabled = Boolean(e.target?.checked);
  localStorage.setItem(STORAGE.sound, soundEnabled ? "1" : "0");
  if (soundEnabled) await playBeep();
});

el("webhookInput")?.addEventListener("input", (e) => {
  webhookUrl = String(e.target?.value || "");
  localStorage.setItem(STORAGE.webhookUrl, webhookUrl);
});

el("webhookToggle")?.addEventListener("change", (e) => {
  webhookEnabled = Boolean(e.target?.checked);
  localStorage.setItem(STORAGE.webhookEnabled, webhookEnabled ? "1" : "0");
});

el("shareBtn")?.addEventListener("click", async () => {
  const value = String(preview?.steamid64 || el("steamInput")?.value || "").trim();
  if (!value) return;
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("steam", value);
    await navigator.clipboard.writeText(u.toString());
    toast("Ссылка скопирована");
  } catch {
    toast("Не удалось скопировать ссылку");
  }
});

el("logoutBtn")?.addEventListener("click", async () => {
  try {
    await fetch("/auth/logout", { method: "POST" });
  } catch {}
  window.location.href = "/";
});

el("accentColor")?.addEventListener("input", (e) => {
  themeAccent = String(e.target?.value || "");
  localStorage.setItem(STORAGE.themeAccent, themeAccent);
  applyTheme();
});

el("hotColor")?.addEventListener("input", (e) => {
  themeHot = String(e.target?.value || "");
  localStorage.setItem(STORAGE.themeHot, themeHot);
  applyTheme();
});

el("resetThemeBtn")?.addEventListener("click", () => {
  themeAccent = "";
  themeHot = "";
  localStorage.removeItem(STORAGE.themeAccent);
  localStorage.removeItem(STORAGE.themeHot);
  applyTheme();
  const a = el("accentColor");
  if (a) a.value = DEFAULT_ACCENT;
  const h = el("hotColor");
  if (h) h.value = DEFAULT_HOT;
  toast("Тема сброшена");
});

el("refreshBtn")?.addEventListener("click", async () => {
  if (watchlist.length || preview?.steamid64) {
    await refreshActive({ fresh: true, quiet: false });
    if (autoEnabled) startAutoRefresh();
    return;
  }
  lookupPreview(el("steamInput")?.value);
});

el("autoToggle")?.addEventListener("change", (e) => {
  autoEnabled = Boolean(e.target?.checked);
  localStorage.setItem(STORAGE.auto, autoEnabled ? "1" : "0");
  if (autoEnabled) startAutoRefresh();
  else stopAutoRefresh();
  refreshMeta();
});

el("intervalSelect")?.addEventListener("change", (e) => {
  intervalSec = clampInterval(e.target?.value);
  localStorage.setItem(STORAGE.intervalSec, String(intervalSec));
  if (autoEnabled) startAutoRefresh();
  refreshMeta();
});

// ---- Init ----
(() => {
  const savedAuto = localStorage.getItem(STORAGE.auto);
  const savedInterval = localStorage.getItem(STORAGE.intervalSec);
  const savedSteam = localStorage.getItem(STORAGE.lastSteam);
  const savedNotif = localStorage.getItem(STORAGE.notif);
  const savedSound = localStorage.getItem(STORAGE.sound);
  const savedWebhookUrl = localStorage.getItem(STORAGE.webhookUrl);
  const savedWebhookEnabled = localStorage.getItem(STORAGE.webhookEnabled);
  const savedThemeAccent = localStorage.getItem(STORAGE.themeAccent);
  const savedThemeHot = localStorage.getItem(STORAGE.themeHot);

  autoEnabled = savedAuto === null ? true : savedAuto === "1";
  intervalSec = clampInterval(savedInterval ?? 15);

  const autoToggle = el("autoToggle");
  if (autoToggle) autoToggle.checked = autoEnabled;
  const intervalSelect = el("intervalSelect");
  if (intervalSelect) intervalSelect.value = String(intervalSec);

  notifEnabled = savedNotif === "1";
  soundEnabled = savedSound === "1";
  webhookUrl = String(savedWebhookUrl || "");
  webhookEnabled = savedWebhookEnabled === "1";

  const notifToggle = el("notifToggle");
  if (notifToggle) notifToggle.checked = notifEnabled;
  const soundToggle = el("soundToggle");
  if (soundToggle) soundToggle.checked = soundEnabled;
  const webhookInput = el("webhookInput");
  if (webhookInput) webhookInput.value = webhookUrl;
  const webhookToggle = el("webhookToggle");
  if (webhookToggle) webhookToggle.checked = webhookEnabled;

  themeAccent = String(savedThemeAccent || "");
  themeHot = String(savedThemeHot || "");
  applyTheme();
  const accentColor = el("accentColor");
  if (accentColor) accentColor.value = themeAccent || DEFAULT_ACCENT;
  const hotColor = el("hotColor");
  if (hotColor) hotColor.value = themeHot || DEFAULT_HOT;

  history = loadHistory();
  renderHistory();

  watchlist = loadWatchlist();
  renderWatchGrid(new Map());
  refreshMeta();

  const urlSteam = new URLSearchParams(window.location.search).get("steam");
  const initialSteam = (urlSteam || savedSteam || "").trim();
  if (initialSteam && el("steamInput")) {
    el("steamInput").value = initialSteam;
    lookupPreview(initialSteam);
  } else if (watchlist.length) {
    refreshActive({ fresh: true, quiet: false });
    startAutoRefresh();
  }

  if (!tickTimer) {
    tickTimer = setInterval(() => {
      refreshMeta();
      updatePlayDurations();
    }, 1000);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAutoRefresh();
      return;
    }
    if (autoEnabled) {
      refreshActive({ fresh: true, quiet: true, fromAuto: true });
      startAutoRefresh();
    }
  });
})();
