import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import aiohttp
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent

STEAM_API_KEY = (os.getenv("STEAM_API_KEY") or "").strip()
if not STEAM_API_KEY:
    raise RuntimeError("Missing STEAM_API_KEY in .env")

CACHE_TTL_SECONDS = int((os.getenv("CACHE_TTL_SECONDS") or "15").strip() or "15")

STEAM_PLAYER_SUMMARIES_URL = "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/"
STEAM_RESOLVE_VANITY_URL = "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/"


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
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@app.get("/", response_class=HTMLResponse)
async def index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/lookup")
async def api_lookup(payload: dict[str, Any]) -> dict[str, Any]:
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
