import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlencode

import aiohttp
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent

STEAM_API_KEY = (os.getenv("STEAM_API_KEY") or "").strip()
if not STEAM_API_KEY:
    raise RuntimeError("Missing STEAM_API_KEY in .env")

SESSION_SECRET = (os.getenv("SESSION_SECRET") or "").strip()
if not SESSION_SECRET:
    # Dev-friendly fallback; set a stable secret in hosting env for persistent sessions.
    SESSION_SECRET = os.urandom(32).hex()

CACHE_TTL_SECONDS = int((os.getenv("CACHE_TTL_SECONDS") or "15").strip() or "15")

STEAM_PLAYER_SUMMARIES_URL = "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/"
STEAM_RESOLVE_VANITY_URL = "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/"
STEAM_OPENID_URL = "https://steamcommunity.com/openid/login"


def _personastate_label(personastate: int | None) -> str:
    return {
        0: "Не в сети",
        1: "В сети",
        2: "Занят",
        3: "Отошёл",
        4: "Спит",
        5: "Хочет обмен",
        6: "Хочет играть",
    }.get(personastate, "Unknown")


def _is_steamid64(value: str) -> bool:
    return value.isdigit() and 15 <= len(value) <= 20


def _extract_steam_identifier(value: str) -> tuple[str, Literal["steamid64", "vanity"]]:
    v = value.strip().strip("<>").strip()
    if _is_steamid64(v):
        return v, "steamid64"

    lowered = v.lower()
    if "steamcommunity.com" in lowered:
        if "/profiles/" in lowered:
            tail = v.split("/profiles/", 1)[1]
            candidate = tail.split("/", 1)[0].split("?", 1)[0].strip()
            if _is_steamid64(candidate):
                return candidate, "steamid64"
        if "/id/" in lowered:
            tail = v.split("/id/", 1)[1]
            vanity = tail.split("/", 1)[0].split("?", 1)[0].strip()
            if vanity:
                return vanity, "vanity"

    # Accept short forms: profiles/<id>, id/<vanity>
    m = re.search(r"(?:^|/)(profiles|id)/([^/?#]+)", v, re.IGNORECASE)
    if m:
        kind = m.group(1).lower()
        value = m.group(2).strip()
        if kind == "profiles" and _is_steamid64(value):
            return value, "steamid64"
        if kind == "id" and value:
            return value, "vanity"

    return v, "vanity"


async def resolve_vanity_url(session: aiohttp.ClientSession, vanity: str) -> str | None:
    params = {"key": STEAM_API_KEY, "vanityurl": vanity}
    async with session.get(STEAM_RESOLVE_VANITY_URL, params=params, timeout=aiohttp.ClientTimeout(total=15)) as resp:
        data = await resp.json()
    response = data.get("response", {})
    if not isinstance(response, dict):
        return None
    if response.get("success") != 1:
        return None
    steam_id = response.get("steamid")
    return str(steam_id) if steam_id else None


async def get_player_summary(session: aiohttp.ClientSession, steamid64: str) -> dict[str, Any] | None:
    params = {"key": STEAM_API_KEY, "steamids": steamid64}
    async with session.get(STEAM_PLAYER_SUMMARIES_URL, params=params, timeout=aiohttp.ClientTimeout(total=15)) as resp:
        data = await resp.json()
    players = data.get("response", {}).get("players", [])
    if not isinstance(players, list) or not players:
        return None
    player = players[0]
    return player if isinstance(player, dict) else None


async def get_player_summaries(session: aiohttp.ClientSession, steamid64s: list[str]) -> list[dict[str, Any]]:
    steamid64s = [s for s in steamid64s if _is_steamid64(s)]
    if not steamid64s:
        return []
    # Steam API supports up to 100 steamids per call.
    steamid64s = steamid64s[:100]
    params = {"key": STEAM_API_KEY, "steamids": ",".join(steamid64s)}
    async with session.get(STEAM_PLAYER_SUMMARIES_URL, params=params, timeout=aiohttp.ClientTimeout(total=15)) as resp:
        data = await resp.json()
    players = data.get("response", {}).get("players", [])
    if not isinstance(players, list):
        return []
    out: list[dict[str, Any]] = []
    for p in players:
        if isinstance(p, dict):
            out.append(p)
    return out


@dataclass(frozen=True)
class CacheEntry:
    expires_at: float
    payload: dict[str, Any]


_cache: dict[str, CacheEntry] = {}


def _cache_get(key: str) -> dict[str, Any] | None:
    entry = _cache.get(key)
    if not entry:
        return None
    if time.time() >= entry.expires_at:
        _cache.pop(key, None)
        return None
    return entry.payload


def _cache_set(key: str, payload: dict[str, Any]) -> None:
    if CACHE_TTL_SECONDS <= 0:
        return
    _cache[key] = CacheEntry(expires_at=time.time() + float(CACHE_TTL_SECONDS), payload=payload)


app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, same_site="lax")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


def _base_url(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}"


def _require_login(request: Request) -> str:
    steamid64 = request.session.get("steamid64")
    if not steamid64:
        raise HTTPException(status_code=401, detail="Login required")
    return str(steamid64)


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    steamid64 = request.session.get("steamid64")
    if not steamid64:
        return templates.TemplateResponse("login.html", {"request": request})

    user = {
        "steamid64": str(steamid64),
        "personaname": request.session.get("personaname"),
        "avatarfull": request.session.get("avatarfull"),
        "profile_url": f"https://steamcommunity.com/profiles/{steamid64}",
    }
    return templates.TemplateResponse("index.html", {"request": request, "user": user})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/auth/steam/login")
async def auth_steam_login(request: Request) -> RedirectResponse:
    base = _base_url(request)
    callback = f"{base}/auth/steam/callback"
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "checkid_setup",
        "openid.return_to": callback,
        "openid.realm": base,
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    }
    return RedirectResponse(url=f"{STEAM_OPENID_URL}?{urlencode(params)}", status_code=302)


@app.get("/auth/steam/callback")
async def auth_steam_callback(request: Request) -> RedirectResponse:
    qp = dict(request.query_params)
    if qp.get("openid.mode") != "id_res":
        raise HTTPException(status_code=400, detail="Steam OpenID failed")

    check = dict(qp)
    check["openid.mode"] = "check_authentication"

    async with aiohttp.ClientSession() as session:
        async with session.post(STEAM_OPENID_URL, data=check, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            text = await resp.text()
        if "is_valid:true" not in text:
            raise HTTPException(status_code=400, detail="Steam OpenID verification failed")

        claimed_id = qp.get("openid.claimed_id", "")
        m = re.search(r"/openid/id/(\d+)$", claimed_id)
        if not m:
            raise HTTPException(status_code=400, detail="Invalid Steam OpenID response")
        steamid64 = m.group(1)

        player = await get_player_summary(session, steamid64)
        request.session["steamid64"] = steamid64
        if player:
            request.session["personaname"] = player.get("personaname")
            request.session["avatarfull"] = player.get("avatarfull")

    return RedirectResponse(url="/", status_code=302)


@app.post("/auth/logout")
async def auth_logout(request: Request) -> dict[str, str]:
    request.session.clear()
    return {"status": "ok"}


@app.post("/api/lookup")
async def api_lookup(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    _require_login(request)
    steam = str(payload.get("steam", "")).strip()
    if not steam:
        raise HTTPException(status_code=400, detail="steam is required")

    fresh = bool(payload.get("fresh", False))
    cache_key = f"lookup:{steam}"
    if not fresh:
        cached = _cache_get(cache_key)
        if cached:
            return cached

    ident, kind = _extract_steam_identifier(steam)
    async with aiohttp.ClientSession() as session:
        steamid64 = ident if kind == "steamid64" else await resolve_vanity_url(session, ident)
        if not steamid64 or not _is_steamid64(steamid64):
            raise HTTPException(status_code=400, detail="Invalid Steam link / SteamID64")

        player = await get_player_summary(session, steamid64)
        if not player:
            raise HTTPException(status_code=404, detail="No data from Steam API")

    out = {
        "steamid64": steamid64,
        "profile_url": f"https://steamcommunity.com/profiles/{steamid64}",
        "personaname": player.get("personaname"),
        "avatarfull": player.get("avatarfull"),
        "avatarmedium": player.get("avatarmedium"),
        "avatar": player.get("avatar"),
        "personastate": player.get("personastate"),
        "personastate_label": _personastate_label(player.get("personastate")),
        "gameid": player.get("gameid"),
        "gameextrainfo": player.get("gameextrainfo"),
        "lastlogoff": player.get("lastlogoff"),
        "loccountrycode": player.get("loccountrycode"),
    }
    _cache_set(cache_key, out)
    return out


@app.post("/api/summaries")
async def api_summaries(request: Request, payload: dict[str, Any]) -> dict[str, Any]:
    _require_login(request)
    steamid64s = payload.get("steamid64s")
    if not isinstance(steamid64s, list) or not steamid64s:
        raise HTTPException(status_code=400, detail="steamid64s (list) is required")

    ids: list[str] = []
    for v in steamid64s:
        s = str(v).strip()
        if not s:
            continue
        if not _is_steamid64(s):
            raise HTTPException(status_code=400, detail=f"Invalid SteamID64: {s}")
        ids.append(s)

    if not ids:
        raise HTTPException(status_code=400, detail="No valid SteamID64s")

    fresh = bool(payload.get("fresh", False))
    normalized = ",".join(sorted(set(ids)))
    cache_key = f"summaries:{normalized}"
    if not fresh:
        cached = _cache_get(cache_key)
        if cached:
            return cached

    async with aiohttp.ClientSession() as session:
        players = await get_player_summaries(session, list(sorted(set(ids))))

    by_id: dict[str, dict[str, Any]] = {}
    for p in players:
        sid = str(p.get("steamid") or "").strip()
        if _is_steamid64(sid):
            by_id[sid] = p

    out_players: list[dict[str, Any]] = []
    missing: list[str] = []
    for sid in ids:
        p = by_id.get(sid)
        if not p:
            missing.append(sid)
            continue
        out_players.append(
            {
                "steamid64": sid,
                "profile_url": f"https://steamcommunity.com/profiles/{sid}",
                "personaname": p.get("personaname"),
                "avatarfull": p.get("avatarfull"),
                "avatarmedium": p.get("avatarmedium"),
                "avatar": p.get("avatar"),
                "personastate": p.get("personastate"),
                "personastate_label": _personastate_label(p.get("personastate")),
                "gameid": p.get("gameid"),
                "gameextrainfo": p.get("gameextrainfo"),
                "lastlogoff": p.get("lastlogoff"),
                "loccountrycode": p.get("loccountrycode"),
            }
        )

    response = {"players": out_players, "missing": missing}
    _cache_set(cache_key, response)
    return response
