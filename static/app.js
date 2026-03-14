const el = (id) => document.getElementById(id);

const STORAGE = {
  lastSteam: "steamStatusSite:lastSteam",
  auto: "steamStatusSite:auto",
  intervalSec: "steamStatusSite:intervalSec",
  presencePrefix: "steamStatusSite:presence:",
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
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
};

const setPill = (state, text) => {
  const dot = el("dot");
  const pillText = el("pillText");
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

const renderProfile = (p, meta = null) => {
  const row = document.createElement("div");
  row.className = "profile appear";

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

  row.appendChild(avatar);
  row.appendChild(info);
  row.appendChild(actions);
  return row;
};

let refreshTimer = null;
let inFlight = false;
let currentSteamValue = null;
let autoEnabled = true;
let intervalSec = 15;

const clampInterval = (s) => {
  const n = Number(s);
  if (!isFinite(n)) return 15;
  return Math.min(20, Math.max(10, Math.round(n)));
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
  return next;
};

const stopAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
};

const setMeta = (text) => {
  const m = el("meta");
  if (!m) return;
  m.textContent = text || "";
};

const refreshMeta = (updatedAt = null) => {
  if (!currentSteamValue) {
    setMeta("");
    return;
  }
  const parts = [];
  parts.push(`Авто: ${autoEnabled ? "вкл" : "выкл"}`);
  parts.push(`Интервал: ${intervalSec}с`);
  if (updatedAt) parts.push(`Обновлено: ${new Date(updatedAt).toLocaleTimeString()}`);
  setMeta(parts.join(" • "));
};

const startAutoRefresh = () => {
  stopAutoRefresh();
  if (!autoEnabled) return;
  if (!currentSteamValue) return;
  refreshTimer = setInterval(() => {
    lookup({ quiet: true, fresh: true });
  }, intervalSec * 1000);
  refreshMeta();
};

const safeReadJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

async function lookup(opts = {}) {
  const input = el("steamInput");
  const v = String((opts.steam ?? input?.value ?? "")).trim();
  if (!v) return;

  const quiet = Boolean(opts.quiet);
  const fresh = Boolean(opts.fresh);

  currentSteamValue = v;
  localStorage.setItem(STORAGE.lastSteam, v);

  if (inFlight) return;
  inFlight = true;

  if (!quiet) {
    setPill("warn", "loading…");
  } else {
    setPill("warn", "обновляю…");
  }
  const result = el("result");
  const hasCard = Boolean(result?.querySelector?.(".profile"));
  if (!quiet || !hasCard) {
    result.innerHTML = skeletonHtml();
  }

  try {
    const res = await fetch("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steam: v, fresh }),
    });
    const data = (await safeReadJson(res)) || {};
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);

    const presence = updatePresenceMeta(data);
    const updatedAt = presence?.updatedAt || Date.now();

    result.innerHTML = "";
    result.appendChild(renderProfile(data, presence));
    const st = statusClass(data.personastate);
    const pillState = st === "offline" ? "bad" : "ok";
    setPill(pillState, data.personastate_label || "ok");
    refreshMeta(updatedAt);

    if (!quiet) startAutoRefresh();
  } catch (e) {
    const msg = e?.message ? String(e.message) : "Unknown error";
    if (!quiet || !hasCard) {
      result.innerHTML = `<div class="empty muted">Ошибка: ${msg}</div>`;
    }
    setPill("bad", "error");
    refreshMeta();
    toast(msg);
  } finally {
    inFlight = false;
  }
}

el("goBtn").addEventListener("click", () => lookup({ quiet: false, fresh: true }));
el("steamInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") lookup({ quiet: false, fresh: true });
});
el("clearBtn").addEventListener("click", () => {
  stopAutoRefresh();
  el("steamInput").value = "";
  currentSteamValue = null;
  localStorage.removeItem(STORAGE.lastSteam);
  el("result").innerHTML = `<div class="empty muted">Пока пусто. Вставь ссылку и нажми Check.</div>`;
  setPill("ok", "ready");
  setMeta("");
});

el("refreshBtn")?.addEventListener("click", () => {
  if (!currentSteamValue) return lookup({ quiet: false, fresh: true });
  lookup({ steam: currentSteamValue, quiet: true, fresh: true });
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

(() => {
  const savedSteam = localStorage.getItem(STORAGE.lastSteam);
  const savedAuto = localStorage.getItem(STORAGE.auto);
  const savedInterval = localStorage.getItem(STORAGE.intervalSec);

  autoEnabled = savedAuto === null ? true : savedAuto === "1";
  intervalSec = clampInterval(savedInterval ?? 15);

  const autoToggle = el("autoToggle");
  if (autoToggle) autoToggle.checked = autoEnabled;

  const intervalSelect = el("intervalSelect");
  if (intervalSelect) intervalSelect.value = String(intervalSec);

  if (savedSteam && el("steamInput")) {
    el("steamInput").value = savedSteam;
    lookup({ steam: savedSteam, quiet: false, fresh: true });
  }
})();
