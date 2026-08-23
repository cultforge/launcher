import asyncio
import base64
import binascii
import hashlib
import hmac
import html
import json
import logging
import os
import re
import subprocess
import sys
import time
import traceback
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote, unquote, urljoin, urlparse

import httpx
import psutil
import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi import status as status_code
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse

from ctfgsdk import client as cliX
from ctfgsdk import keyring_store
from ctfgsdk.hosts import describe_bases, http_to_ws, module_base
from ctfgsdk.schema import (
    AccountDeleteRequest,
    SignupRequest,
    UserAvatarUpdateRequest,
    UserHandleUpdateRequest,
)

APP_VERSION = "2.4.2"
ws_connections: set[WebSocket] = set()

LOG_LEVELS = {"DEBUG", "INFO", "SUCCESS", "WARNING", "ERROR", "CRITICAL", "EXCEPTION"}

# Rate samples for disk I/O and network (module-level).
_io_prev: dict[str, Any] | None = None
_metrics_logged_once = False
# Latest OAuth callback signal for UI polling (no JWT).
_oauth_pending: dict[str, Any] | None = None

# In-memory mirrors of keyring (Sidecar 2 sKEY / rKEY).
sKEY: str = ""
rKEY: str = ""
_skey_user_agent: str | None = None
_skey_platform: str | None = None

# Platform admin capability JWT — memory only, never keyring.
_admin_capability: str = ""
_admin_capability_expires_at: float = 0.0
_admin_catalog_cache: list[dict[str, Any]] | None = None
_admin_catalog_fetched_at: float = 0.0

# Presence / global chat bridge: React never opens the remote socket.
# Bases follow CULTFORGE_USE_LOCAL_API (opt-in) or live production hosts.
API_BASE = module_base("api")
AUTH_BASE = module_base("auth")
GUILDS_BASE = module_base("guilds")
INVITE_BASE = module_base("invite")
PRESENCE_WS_URL = http_to_ws(API_BASE)
GUILDS_WS_URL = http_to_ws(GUILDS_BASE)
LOOPBACK_HEADER = "X-CultForge-Loopback-Secret"
LOOPBACK_QUERY = "cf_loopback"
LOOPBACK_EXEMPT_PREFIXES = ("/auth/callback",)
ADMIN_CAPABILITY_MAX_TTL = 900.0
ADMIN_CATALOG_TTL = 300.0
# Remote /v1/ws may also push:
#   {"type": "chloe.action.pending", "payload": {action_id, tool, args, risk, summary, ...}}
#   {"type": "chloe.action.execute", "payload": {action_id, tool, args, summary, ...}}
#   {"type": "agent.command.updated", "payload": {id, node_id, status, result, ...}}

# Local guild media bytes (icon/banner/covers) — avoid re-hitting Cloudflare.
_guild_media_local_cache: dict[str, tuple[bytes, str]] = {}


def _guild_media_cache_dir() -> str:
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or os.getcwd()
    folder = os.path.join(base, "CultForge", "guild-media-cache")
    os.makedirs(folder, exist_ok=True)
    return folder


def _guild_media_cache_paths(media_path: str) -> tuple[str, str]:
    digest = hashlib.sha256(media_path.encode("utf-8")).hexdigest()
    folder = _guild_media_cache_dir()
    return (
        os.path.join(folder, f"{digest}.bin"),
        os.path.join(folder, f"{digest}.json"),
    )


def _cache_guild_media_bytes(media_path: str, raw: bytes, content_type: str) -> None:
    key = (media_path or "").strip().strip("/")
    if not key or not raw:
        return
    ctype = content_type or "application/octet-stream"
    _guild_media_local_cache[key] = (raw, ctype)
    bin_path, meta_path = _guild_media_cache_paths(key)
    try:
        with open(bin_path, "wb") as fh:
            fh.write(raw)
        with open(meta_path, "w", encoding="utf-8") as fh:
            json.dump({"path": key, "content_type": ctype}, fh)
    except OSError:
        pass


def _load_cached_guild_media(media_path: str) -> tuple[bytes, str] | None:
    key = (media_path or "").strip().strip("/")
    if not key:
        return None
    hit = _guild_media_local_cache.get(key)
    if hit:
        return hit
    bin_path, meta_path = _guild_media_cache_paths(key)
    if not (os.path.isfile(meta_path) and os.path.isfile(bin_path)):
        return None
    try:
        with open(meta_path, encoding="utf-8") as fh:
            meta = json.load(fh)
        with open(bin_path, "rb") as fh:
            raw = fh.read()
        if not raw:
            return None
        ctype = str(meta.get("content_type") or "application/octet-stream")
        _guild_media_local_cache[key] = (raw, ctype)
        return raw, ctype
    except (OSError, json.JSONDecodeError, TypeError):
        return None


def _clear_cached_guild_media(media_path: str | None = None) -> None:
    if media_path:
        key = media_path.strip().strip("/")
        _guild_media_local_cache.pop(key, None)
        for path in _guild_media_cache_paths(key):
            try:
                if os.path.isfile(path):
                    os.remove(path)
            except OSError:
                pass
        return
    _guild_media_local_cache.clear()
    try:
        folder = _guild_media_cache_dir()
        for name in os.listdir(folder):
            try:
                os.remove(os.path.join(folder, name))
            except OSError:
                pass
    except OSError:
        pass


# Local avatar bytes after successful upload (user_id may contain '/').
# Serves display while remote GET /v1/profile/{uid}/avatar is broken/unfixed.
_avatar_local_cache: dict[str, tuple[bytes, str]] = {}


def _avatar_cache_dir() -> str:
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or os.getcwd()
    folder = os.path.join(base, "CultForge", "avatar-cache")
    os.makedirs(folder, exist_ok=True)
    return folder


def _avatar_cache_file(user_id: str) -> str:
    digest = hashlib.sha256(user_id.encode("utf-8")).hexdigest()
    return os.path.join(_avatar_cache_dir(), f"{digest}.bin")


def _avatar_cache_meta(user_id: str) -> str:
    digest = hashlib.sha256(user_id.encode("utf-8")).hexdigest()
    return os.path.join(_avatar_cache_dir(), f"{digest}.json")


def _cache_avatar_bytes(user_id: str, raw: bytes, content_type: str) -> None:
    uid = (user_id or "").strip()
    if not uid or not raw:
        return
    ctype = content_type or "application/octet-stream"
    _avatar_local_cache[uid] = (raw, ctype)
    try:
        with open(_avatar_cache_file(uid), "wb") as fh:
            fh.write(raw)
        with open(_avatar_cache_meta(uid), "w", encoding="utf-8") as fh:
            json.dump({"user_id": uid, "content_type": ctype}, fh)
    except OSError:
        pass


def _load_cached_avatar(user_id: str) -> tuple[bytes, str] | None:
    uid = (user_id or "").strip()
    if not uid:
        return None
    hit = _avatar_local_cache.get(uid)
    if hit:
        return hit
    meta_path = _avatar_cache_meta(uid)
    bin_path = _avatar_cache_file(uid)
    if not (os.path.isfile(meta_path) and os.path.isfile(bin_path)):
        return None
    try:
        with open(meta_path, encoding="utf-8") as fh:
            meta = json.load(fh)
        with open(bin_path, "rb") as fh:
            raw = fh.read()
        if not raw:
            return None
        ctype = str(meta.get("content_type") or "application/octet-stream")
        _avatar_local_cache[uid] = (raw, ctype)
        return raw, ctype
    except (OSError, json.JSONDecodeError, TypeError):
        return None


def _clear_cached_avatar(user_id: str | None = None) -> None:
    if user_id:
        uid = user_id.strip()
        _avatar_local_cache.pop(uid, None)
        for path in (_avatar_cache_file(uid), _avatar_cache_meta(uid)):
            try:
                if os.path.isfile(path):
                    os.remove(path)
            except OSError:
                pass
        return
    _avatar_local_cache.clear()
    try:
        folder = _avatar_cache_dir()
        for name in os.listdir(folder):
            try:
                os.remove(os.path.join(folder, name))
            except OSError:
                pass
    except OSError:
        pass


def _decode_avatar_base64(b64: str) -> bytes | None:
    text = (b64 or "").strip()
    if not text:
        return None
    if text.lower().startswith("data:"):
        comma = text.find(",")
        if comma < 0:
            return None
        text = text[comma + 1 :].strip()
    try:
        return base64.b64decode(text, validate=True)
    except (binascii.Error, ValueError):
        try:
            return base64.b64decode(text)
        except Exception:
            return None


def _user_id_from_avatar_payload(data: dict | None) -> str | None:
    if not isinstance(data, dict):
        return None
    inner = data.get("data")
    candidates: list[Any] = [data, inner]
    if isinstance(inner, dict):
        candidates.append(inner.get("user"))
        candidates.append(inner.get("profile"))
    for obj in candidates:
        if not isinstance(obj, dict):
            continue
        for key in ("user_id", "id", "uid"):
            val = obj.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
        url = obj.get("avatar_url")
        if isinstance(url, str) and "/v1/profile/" in url and url.rstrip("/").endswith(
            "/avatar"
        ):
            mid = url.split("/v1/profile/", 1)[1]
            uid = mid[: -len("/avatar")].strip("/")
            if uid:
                return uid
    return None


PRESENCE_PING_SECONDS = 25
_presence_task: asyncio.Task | None = None
_presence_wake: asyncio.Event | None = None
_guilds_ws_task: asyncio.Task | None = None
_guilds_ws_wake: asyncio.Event | None = None
# Active guilds remote socket for React → remote uplink (channel join/leave).
_guilds_remote_ws: Any | None = None
_guilds_remote_lock = asyncio.Lock()

# Warm CPU counter so the first non-blocking sample is meaningful.
psutil.cpu_percent(interval=None)


def _session_token_path() -> str:
    """Legacy plaintext path — only used for one-time migration."""
    base = os.environ.get("APPDATA") or os.environ.get("LOCALAPPDATA") or os.getcwd()
    folder = os.path.join(base, "CultForge")
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, "sidecar-session.json")


def _wake_presence_bridge() -> None:
    global _presence_wake, _guilds_ws_wake
    if _presence_wake is not None:
        _presence_wake.set()
    if _guilds_ws_wake is not None:
        _guilds_ws_wake.set()


def _expected_loopback_secret() -> str:
    return (os.environ.get("CULTFORGE_LOOPBACK_SECRET") or "").strip()


def _request_loopback_secret(request: Request) -> str:
    header = (request.headers.get(LOOPBACK_HEADER) or "").strip()
    if header:
        return header
    return (request.query_params.get(LOOPBACK_QUERY) or "").strip()


def _loopback_exempt(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in LOOPBACK_EXEMPT_PREFIXES)


def _jwt_exp_epoch(token: str) -> float | None:
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return None
        pad = "=" * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + pad))
        exp = payload.get("exp")
        if exp is None:
            return None
        return float(exp)
    except Exception:
        return None


def clear_admin_capability() -> None:
    global _admin_capability, _admin_capability_expires_at
    global _admin_catalog_cache, _admin_catalog_fetched_at
    _admin_capability = ""
    _admin_capability_expires_at = 0.0
    _admin_catalog_cache = None
    _admin_catalog_fetched_at = 0.0


def set_admin_capability(token: str, ttl_seconds: float = ADMIN_CAPABILITY_MAX_TTL) -> None:
    global _admin_capability, _admin_capability_expires_at
    token = (token or "").strip()
    if not token:
        clear_admin_capability()
        return
    now = time.time()
    exp = _jwt_exp_epoch(token)
    if exp and exp > now:
        expires = min(exp, now + ttl_seconds)
    else:
        expires = now + ttl_seconds
    _admin_capability = token
    _admin_capability_expires_at = expires


def admin_capability_valid() -> bool:
    if not _admin_capability:
        return False
    if time.time() >= _admin_capability_expires_at:
        clear_admin_capability()
        return False
    return True


def admin_capability_headers() -> dict[str, str]:
    if not admin_capability_valid():
        return {}
    return {"X-Admin-Capability": _admin_capability}


def admin_capability_local_status() -> dict[str, Any]:
    valid = admin_capability_valid()
    return {
        "capability_active": valid,
        "capability_expires_at": int(_admin_capability_expires_at * 1000)
        if valid
        else None,
    }


def _extract_capability_token(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    for key in ("capability_token", "token", "access_token"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    data = payload.get("data")
    if isinstance(data, dict):
        return _extract_capability_token(data)
    return None


def _catalog_entry_key(entry: dict[str, Any]) -> tuple[str, str]:
    return (
        str(entry.get("method") or "GET").upper(),
        str(entry.get("path") or "").strip(),
    )


def _catalog_path_matches(template: str, actual: str) -> bool:
    """Match catalog templates like /v1/admin/users/{id}/sessions to concrete paths."""
    template = template.strip()
    actual = actual.strip()
    if template == actual:
        return True
    if "{" not in template:
        return False
    t_parts = [p for p in template.split("/") if p]
    a_parts = [p for p in actual.split("/") if p]
    if len(t_parts) != len(a_parts):
        return False
    for t_seg, a_seg in zip(t_parts, a_parts):
        if t_seg.startswith("{") and t_seg.endswith("}"):
            if not a_seg:
                return False
            continue
        if t_seg != a_seg:
            return False
    return True


def _find_catalog_entry(
    method: str,
    path: str,
    catalog: list[dict[str, Any]],
) -> dict[str, Any] | None:
    want_method = (method or "GET").upper()
    want_path = (path or "").strip()
    if not want_path:
        return None
    for entry in catalog:
        if _catalog_entry_key(entry) == (want_method, want_path):
            return entry
    for entry in catalog:
        entry_method, entry_path = _catalog_entry_key(entry)
        if entry_method != want_method:
            continue
        if _catalog_path_matches(entry_path, want_path):
            return entry
    return None


async def _fetch_admin_catalog_remote(
    http: httpx.AsyncClient,
    headers: dict[str, str],
    *,
    force: bool = False,
) -> list[dict[str, Any]]:
    global _admin_catalog_cache, _admin_catalog_fetched_at
    now = time.time()
    if (
        not force
        and _admin_catalog_cache is not None
        and (now - _admin_catalog_fetched_at) < ADMIN_CATALOG_TTL
    ):
        return _admin_catalog_cache

    response = await http.get(f"{API_BASE}/v1/admin/catalog", headers=headers)
    data = response.json() if response.content else {}
    entries: list[dict[str, Any]] = []
    if isinstance(data, dict):
        raw = data.get("data")
        if isinstance(raw, list):
            entries = [e for e in raw if isinstance(e, dict)]
    _admin_catalog_cache = entries
    _admin_catalog_fetched_at = now
    return entries


async def _admin_upstream_json(
    request: Request,
    method: str,
    url: str,
    *,
    json_body: dict[str, Any] | None = None,
    extra_headers: dict[str, str] | None = None,
    require_session: bool = True,
) -> tuple[int, dict[str, Any]]:
    try:
        headers = _api_auth_headers(require_session=require_session)
    except PermissionError as exc:
        return 401, {"status": False, "message": str(exc), "code": 401}
    if extra_headers:
        headers.update(extra_headers)
    http: httpx.AsyncClient | None = getattr(request.app.state, "http", None)
    if http is None:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            response = await client.request(method.upper(), url, json=json_body, headers=headers)
    else:
        response = await http.request(method.upper(), url, json=json_body, headers=headers)
    try:
        data = response.json()
    except Exception:
        data = {"status": False, "message": response.text[:240], "code": response.status_code}
    if not isinstance(data, dict):
        data = {"status": True, "data": data, "code": response.status_code}
    if response.status_code == 401 and extra_headers and extra_headers.get("X-Admin-Capability"):
        clear_admin_capability()
    return response.status_code, data


def current_session_key() -> str:
    """Prefer memory; fall back to keyring if memory was cleared unexpectedly."""
    global sKEY
    if sKEY:
        return sKEY
    sKEY = keyring_store.get_skey()
    return sKEY


def _launcher_prefs_path() -> str:
    base = os.environ.get("APPDATA") or os.environ.get("LOCALAPPDATA") or os.getcwd()
    folder = os.path.join(base, "CultForge")
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, "launcher_prefs.json")


def _read_launcher_prefs() -> dict[str, Any]:
    path = _launcher_prefs_path()
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_launcher_prefs(data: dict[str, Any]) -> None:
    with open(_launcher_prefs_path(), "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)


def _normalize_installed_builds(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if isinstance(item, str) and item.strip():
            out.append({"id": item.strip(), "name": item.strip(), "mods": []})
            continue
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or item.get("id") or "").strip()
        ident = str(item.get("id") or name).strip()
        if not name and not ident:
            continue
        mods_raw = item.get("mods") or item.get("mod_slugs") or []
        mods: list[str] = []
        if isinstance(mods_raw, str):
            mods = [p.strip() for p in mods_raw.split(",") if p.strip()]
        elif isinstance(mods_raw, list):
            for mod in mods_raw:
                if isinstance(mod, dict):
                    label = str(
                        mod.get("slug") or mod.get("name") or mod.get("id") or ""
                    ).strip()
                else:
                    label = str(mod).strip()
                if label:
                    mods.append(label)
        entry: dict[str, Any] = {
            "id": ident or name,
            "name": name or ident,
            "mods": mods,
        }
        if item.get("loader"):
            entry["loader"] = str(item.get("loader"))
        if item.get("mc") or item.get("minecraft_version"):
            entry["mc"] = str(item.get("mc") or item.get("minecraft_version"))
        if "active" in item:
            entry["active"] = bool(item.get("active"))
        out.append(entry)
    return out


def _inventory_from_prefs(prefs: dict[str, Any] | None = None) -> dict[str, Any]:
    data = prefs if isinstance(prefs, dict) else _read_launcher_prefs()
    builds = _normalize_installed_builds(data.get("installed_builds"))
    mods: list[str] = []
    seen: set[str] = set()
    for build in builds:
        for mod in build.get("mods") or []:
            key = str(mod).strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            mods.append(str(mod).strip())
    extra = data.get("installed_mods")
    extra_list = extra if isinstance(extra, list) else []
    for mod in extra_list:
        if isinstance(mod, dict):
            label = str(mod.get("slug") or mod.get("name") or "").strip()
        else:
            label = str(mod).strip()
        key = label.lower()
        if not key or key in seen:
            continue
        seen.add(key)
        mods.append(label)
    return {"installed_builds": builds, "installed_mods": mods}


def _launcher_activity_snapshot() -> dict[str, Any]:
    prefs = _read_launcher_prefs()
    last = prefs.get("last_played")
    snap: dict[str, Any] = {}
    if isinstance(last, dict):
        snap["last_played"] = last
        build = last.get("build_name") or last.get("build") or last.get("build_id")
        if build:
            snap["last_build"] = str(build)
        server = last.get("server_name") or last.get("server")
        if server:
            snap["last_server"] = str(server)
        when = last.get("at") or last.get("played_at")
        if when:
            snap["last_played_at"] = str(when)
    elif isinstance(last, str) and last.strip():
        snap["last_played"] = last.strip()
    inv = _inventory_from_prefs(prefs)
    if inv["installed_builds"] or inv["installed_mods"]:
        snap["installed_builds"] = inv["installed_builds"]
        snap["installed_mods"] = inv["installed_mods"]
    extra_prefs = {
        k: v
        for k, v in prefs.items()
        if k not in {"last_played", "installed_builds", "installed_mods"}
        and v is not None
    }
    if extra_prefs:
        snap["prefs"] = extra_prefs
    return snap


def _api_auth_headers(*, require_session: bool = False) -> dict[str, str]:
    token = current_session_key()
    if require_session and not token:
        raise PermissionError("No session key (sKEY). Sign in first.")
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if _skey_user_agent:
        headers["User-Agent"] = _skey_user_agent
    if _skey_platform:
        headers["sec-ch-ua-platform"] = _skey_platform
    return headers


async def _chloe_api(
    method: str,
    path: str,
    *,
    command: str | None = None,
    json_body: dict[str, Any] | None = None,
    require_session: bool = True,
) -> tuple[int, dict[str, Any]]:
    """Prefer sdk.dispatch(operationId), else httpx to API_BASE."""
    params = dict(json_body or {})
    sdk: cliX.Client | None = getattr(getattr(app, "state", None), "sdk", None)
    if sdk is not None and command:
        try:
            data = await sdk.dispatch("api", command, **params)
            if isinstance(data, dict):
                code = 200
                try:
                    code = int(data.get("code") or 200)
                except (TypeError, ValueError):
                    code = 200
                return code, data
            return 200, {"status": True, "data": data, "code": 200}
        except Exception as exc:
            await emit_log("DEBUG", f"Chloe {path} dispatch: {exc}")
    try:
        headers = _api_auth_headers(require_session=require_session)
    except PermissionError as exc:
        return 401, {"status": False, "message": str(exc), "code": 401}
    http = getattr(getattr(app, "state", None), "http", None)
    url = f"{API_BASE}{path}"
    try:
        if http is None:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.request(
                    method.upper(),
                    url,
                    headers=headers,
                    json=json_body,
                )
        else:
            response = await http.request(
                method.upper(),
                url,
                headers=headers,
                json=json_body,
            )
        try:
            data = response.json()
        except Exception:
            data = {
                "status": False,
                "message": (response.text or "")[:300],
                "code": response.status_code,
            }
        if not isinstance(data, dict):
            data = {"status": True, "data": data, "code": response.status_code}
        if "code" not in data:
            data = {**data, "code": response.status_code}
        return int(response.status_code), data
    except Exception as exc:
        return 502, {
            "status": False,
            "message": "API service unreachable",
            "data": {"debug": str(exc)},
            "code": 502,
        }


async def _report_chloe_action_result(
    action_id: str, ok: bool, message: str, result_data: dict[str, Any]
) -> None:
    body = {"ok": ok, "message": message, "data": result_data, "action_id": action_id}
    await _chloe_api(
        "POST",
        f"/v1/chloe/actions/{action_id}/result",
        command="report_launcher-local_execution_result_for_a_chloe_action",
        json_body=body,
        require_session=True,
    )


async def _sync_launcher_state_to_api() -> None:
    """Push last-played / prefs snapshot so Chloe can remember launcher activity."""
    snap = _launcher_activity_snapshot()
    if not snap:
        return
    sdk: cliX.Client | None = getattr(getattr(app, "state", None), "sdk", None)
    if sdk is not None:
        try:
            await sdk.dispatch(
                "api",
                "sync_launcher_last-played_/_prefs_snapshot_for_chloe",
                **snap,
            )
            return
        except Exception as exc:
            await emit_log("DEBUG", f"Chloe launcher-state dispatch: {exc}")
    try:
        headers = _api_auth_headers(require_session=True)
        http = getattr(getattr(app, "state", None), "http", None)
        if http is None:
            async with httpx.AsyncClient(timeout=15.0) as client:
                await client.request(
                    "POST",
                    f"{API_BASE}/v1/chloe/launcher-state",
                    headers=headers,
                    json=snap,
                )
        else:
            await http.request(
                "POST",
                f"{API_BASE}/v1/chloe/launcher-state",
                headers=headers,
                json=snap,
            )
    except Exception as exc:
        await emit_log("DEBUG", f"Chloe launcher-state sync skipped: {exc}")


def _apply_sidecar_chloe_tool(
    tool: str, args: dict[str, Any]
) -> tuple[bool, str, dict[str, Any]]:
    """Sidecar-safe Chloe tools (no silent Minecraft launch/install)."""
    if tool == "open_launcher":
        target = str((args or {}).get("target") or "home")
        deep_link = str((args or {}).get("deep_link") or f"cultforge://nav/{target}")
        action_id = str((args or {}).get("action_id") or "local-open")
        frame = {
            "type": "chloe.action.local",
            "payload": {
                "tool": tool,
                "args": args or {},
                "deep_link": deep_link,
                "target": target,
                "action_id": action_id,
                "id": action_id,
            },
        }
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(broadcast_ws(frame))
        except RuntimeError:
            pass
        return True, f"Opened {deep_link}", {"deep_link": deep_link, "target": target}

    if tool == "set_launcher_pref":
        key = str((args or {}).get("key") or "telemetry_opt_out")
        value = (args or {}).get("value", True)
        prefs = _read_launcher_prefs()
        prefs[key] = value
        _write_launcher_prefs(prefs)
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_sync_launcher_state_to_api())
        except RuntimeError:
            pass
        return True, f"Set {key}={value}", {"key": key, "value": value, "prefs": prefs}

    if tool == "read_launcher_activity":
        snap = _launcher_activity_snapshot()
        if not snap:
            return True, "No local last-played session recorded yet.", {"last_played": None}
        label = ""
        last = snap.get("last_played")
        if isinstance(last, dict):
            label = str(
                last.get("label")
                or last.get("build_name")
                or last.get("build")
                or "session"
            )
        elif isinstance(last, str):
            label = last
        extra: list[str] = []
        if snap.get("last_build"):
            extra.append(f"build `{snap['last_build']}`")
        if snap.get("last_server"):
            extra.append(f"server `{snap['last_server']}`")
        if snap.get("last_played_at"):
            extra.append(str(snap["last_played_at"]))
        msg = f"Last launcher session: **{label or 'recorded'}**"
        if extra:
            msg += " (" + " · ".join(extra) + ")"
        return True, msg, snap

    if tool == "list_local_builds":
        inv = _inventory_from_prefs()
        builds = inv["installed_builds"]
        if not builds:
            return True, "No local builds recorded yet. Sync inventory from the launcher UI.", inv
        names = ", ".join(str(b.get("name") or b.get("id")) for b in builds[:20])
        more = f" (+{len(builds) - 20} more)" if len(builds) > 20 else ""
        return True, f"Installed locally: **{names}**{more}", inv

    if tool == "list_local_mods":
        inv = _inventory_from_prefs()
        needle = str((args or {}).get("mod") or "").strip().lower()
        mods = inv["installed_mods"]
        builds = inv["installed_builds"]
        if needle:
            hit_mods = [m for m in mods if needle in m.lower() or m.lower() in needle]
            hit_builds = [
                str(b.get("name") or b.get("id"))
                for b in builds
                if any(
                    needle in str(m).lower() or str(m).lower() in needle
                    for m in (b.get("mods") or [])
                )
                or needle in str(b.get("name") or "").lower()
            ]
            if hit_mods or hit_builds:
                where = ", ".join(hit_builds[:8]) if hit_builds else ", ".join(hit_mods[:8])
                return True, f"**{needle}** is installed locally ({where}).", inv
            return True, f"**{needle}** is not in the local inventory snapshot.", inv
        if not mods and not builds:
            return True, "No local mods recorded yet. Sync inventory from the launcher UI.", inv
        shown = ", ".join(mods[:20]) if mods else "(none listed on builds)"
        more = f" (+{len(mods) - 20} more)" if len(mods) > 20 else ""
        return True, f"Local mods: **{shown}**{more}", inv

    return False, f"Unsupported sidecar tool `{tool}`", {}


async def _maybe_handle_chloe_action_frame(frame: dict[str, Any]) -> None:
    """Apply sidecar-safe tools when API pushes chloe.action.execute (e.g. Discord confirm)."""
    event_type = str(frame.get("type") or "")
    if event_type != "chloe.action.execute":
        return
    payload = frame.get("payload") if isinstance(frame.get("payload"), dict) else frame
    if not isinstance(payload, dict):
        return
    action_id = str(payload.get("action_id") or payload.get("id") or "")
    tool = str(payload.get("tool") or "")
    args = payload.get("args") if isinstance(payload.get("args"), dict) else {}
    # open_launcher stays UI-only on presence WS (React already executes it).
    sidecar_tools = {
        "set_launcher_pref",
        "read_launcher_activity",
        "list_local_builds",
        "list_local_mods",
    }
    if not action_id or tool not in sidecar_tools:
        return
    ok, message, result_data = _apply_sidecar_chloe_tool(tool, args)
    try:
        await _report_chloe_action_result(action_id, ok, message, result_data)
        if tool == "set_launcher_pref":
            await _sync_launcher_state_to_api()
        await emit_log(
            "INFO" if ok else "WARNING",
            f"Chloe execute {tool} id={action_id}: {message}",
        )
    except Exception as exc:
        await emit_log("WARNING", f"Chloe action result report failed: {exc}")


def set_session_key(
    token: str,
    *,
    user_agent: str | None = None,
    platform: str | None = None,
    sdk: cliX.Client | None = None,
) -> None:
    """Persist app session JWT as sKEY (memory + keyring + optional SDK)."""
    global sKEY, _skey_user_agent, _skey_platform
    token = (token or "").strip()
    sKEY = token
    if token:
        keyring_store.set_skey(token)
        if user_agent is not None or platform is not None:
            _skey_user_agent = user_agent
            _skey_platform = platform
            keyring_store.set_skey_meta(
                user_agent=user_agent, platform=platform
            )
        else:
            meta = keyring_store.get_skey_meta()
            _skey_user_agent = meta.get("user_agent")
            _skey_platform = meta.get("platform")
        if sdk is not None:
            # Never wipe an in-memory OAuth fingerprint when meta/UA is missing.
            sdk.setup_session_token(
                token,
                user_agent=_skey_user_agent,
                platform=_skey_platform,
                retain_fingerprint=_skey_user_agent is None
                and _skey_platform is None,
            )
    else:
        clear_session_key(sdk=sdk)
        return
    _wake_presence_bridge()


def clear_session_key(sdk: cliX.Client | None = None) -> None:
    global sKEY, _skey_user_agent, _skey_platform
    sKEY = ""
    _skey_user_agent = None
    _skey_platform = None
    _clear_cached_avatar()
    clear_admin_capability()
    keyring_store.clear_skey()
    keyring_store.clear_skey_meta()
    if sdk is not None:
        sdk.clear_session_token()
    # Also clear legacy stores.
    try:
        import keyring

        keyring.delete_password("CultForge", "app_session")
    except Exception:
        pass
    path = _session_token_path()
    if os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass
    _wake_presence_bridge()


def set_register_key(token: str, sdk: cliX.Client | None = None) -> None:
    global rKEY
    token = (token or "").strip()
    rKEY = token
    if token:
        keyring_store.set_rkey(token)
        if sdk is not None:
            sdk.setup_register_token(token)
    else:
        clear_register_key(sdk=sdk)


def clear_register_key(sdk: cliX.Client | None = None) -> None:
    global rKEY
    rKEY = ""
    keyring_store.clear_rkey()
    if sdk is not None:
        sdk.rToken = None


def load_keys_from_keyring(sdk: cliX.Client | None = None) -> None:
    """Hydrate process memory from OS keyring (startup / recovery)."""
    global sKEY, rKEY, _skey_user_agent, _skey_platform
    keyring_store.migrate_legacy_app_session()
    # Legacy file migrate.
    if not keyring_store.get_skey():
        path = _session_token_path()
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
            token = data.get("token") if isinstance(data, dict) else None
            if isinstance(token, str) and token.strip():
                ua = (
                    data.get("user_agent")
                    if isinstance(data.get("user_agent"), str)
                    else None
                )
                plat = (
                    data.get("platform")
                    if isinstance(data.get("platform"), str)
                    else None
                )
                set_session_key(token.strip(), user_agent=ua, platform=plat, sdk=sdk)
                try:
                    os.remove(path)
                except OSError:
                    pass
                return
        except Exception:
            pass

    sKEY = keyring_store.get_skey()
    rKEY = keyring_store.get_rkey()
    meta = keyring_store.get_skey_meta()
    _skey_user_agent = meta.get("user_agent")
    _skey_platform = meta.get("platform")
    if sdk is not None:
        if sKEY:
            # Hydrate SDK session so dispatch() attaches Bearer for auth: session routes.
            sdk.setup_session_token(
                sKEY,
                user_agent=_skey_user_agent,
                platform=_skey_platform,
            )
        if rKEY:
            sdk.setup_register_token(rKEY)


def _fingerprint_from_request(request: Request) -> tuple[str | None, str | None]:
    """Capture browser fingerprint headers from the OAuth callback request."""
    ua = request.headers.get("user-agent")
    platform = request.headers.get("sec-ch-ua-platform")
    return (ua, platform)


def _extract_session_token(payload: dict | None) -> str | None:
    if not isinstance(payload, dict):
        return None
    for key in ("token", "access_token", "session_token"):
        value = payload.get(key)
        if isinstance(value, str) and value.count(".") >= 2:
            return value.strip()
    data = payload.get("data")
    if isinstance(data, dict):
        nested = _extract_session_token(data)
        if nested:
            return nested
        inner = data.get("payload")
        if isinstance(inner, dict):
            return _extract_session_token(inner)
        if isinstance(inner, str) and inner.count(".") >= 2:
            return inner.strip()
    nested_payload = payload.get("payload")
    if isinstance(nested_payload, dict):
        return _extract_session_token(nested_payload)
    return None


def _log_payload(level: str, message: str, stack: str | None = None) -> dict[str, Any]:
    level = level.upper()
    if level not in LOG_LEVELS:
        level = "INFO"
    payload: dict[str, Any] = {
        "type": "log",
        "level": level,
        "message": message,
        "source": "client",
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    if stack:
        payload["stack"] = stack
    return payload


_SECRET_QUERY_RE = re.compile(
    r"(?i)\b(cf_loopback|token|skey|rkey|authorization|bearer|password|secret)=([^\s&\"']+)"
)
_JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")
_METHOD_STATUS_VERB = {
    "GET": "Fetching",
    "POST": "Updating",
    "PUT": "Updating",
    "PATCH": "Patching",
    "DELETE": "Removing",
}
_COMMAND_STATUS: dict[tuple[str, str], str] = {
    ("api", "get_my_profile"): "Fetching profile",
    ("api", "get_my_friends"): "Loading friends",
    ("api", "root"): "Checking remote API",
    ("api", "mping"): "Checking server status",
    ("guilds", "list_guilds"): "Loading guilds",
    ("guilds", "get_guild"): "Loading guild",
    ("guilds", "create_guild_build"): "Creating guild build",
    ("guilds", "update_guild_build"): "Updating guild build",
    ("guilds", "delete_guild_build"): "Removing guild build",
    ("guilds", "list_guild_builds"): "Loading guild builds",
    ("guilds", "get_guild_build"): "Fetching guild build",
    ("servers", "list_servers"): "Loading servers",
    ("servers", "get_server"): "Fetching server",
    ("servers", "patch_server"): "Patching server",
    ("servers", "update_server"): "Updating server",
}
_PATH_STATUS: dict[str, str] = {
    "/": "Checking client",
    "/auth/callback": "Completing sign-in",
    "/auth/session": "Loading session",
    "/auth/create_account": "Creating account",
    "/auth/update_handle": "Updating handle",
    "/auth/update_avatar": "Updating avatar",
    "/auth/delete_account": "Deleting account",
    "/logout": "Signing out",
    "/admin/whoami": "Checking admin access",
    "/admin/catalog": "Loading admin catalog",
    "/admin/step-up": "Elevating admin session",
    "/admin/request": "Running admin request",
    "/music/lobby": "Loading lobby music",
    "/chloe/prefs": "Loading Chloe prefs",
    "/chloe/inventory": "Loading Chloe inventory",
    "/chloe/tools": "Loading Chloe tools",
}
_QUIET_PATH_PREFIXES = (
    "/ping",
    "/health",
    "/ws",
    "/auth/oauth/pending",
    "/system/metrics",
    "/media/",
    "/discord/",
    "/music/lobby/audio",
    "/chloe/actions/pending",
)
_QUIET_PATH_EXACT = frozenset({"/favicon.ico", "/docs", "/openapi.json", "/redoc"})


def _redact_log_text(text: str) -> str:
    if not text:
        return text
    out = _SECRET_QUERY_RE.sub(r"\1=<redacted>", text)
    out = _JWT_RE.sub("<redacted-jwt>", out)
    return out


def _humanize_words(value: str) -> str:
    return " ".join(part for part in value.replace("-", "_").split("_") if part)


def status_for_send(module: str, command: str, method: str = "GET") -> str:
    key = (module.lower(), command.lower())
    if key in _COMMAND_STATUS:
        return _COMMAND_STATUS[key]
    verb = _METHOD_STATUS_VERB.get(method.upper(), "Calling")
    label = _humanize_words(command) or command
    return f"{verb} {label}"


def status_for_path(path: str, method: str = "GET") -> str | None:
    clean = path.split("?", 1)[0]
    if clean in _QUIET_PATH_EXACT:
        return None
    for prefix in _QUIET_PATH_PREFIXES:
        if clean == prefix or clean.startswith(prefix):
            return None
    if clean.startswith("/send/"):
        parts = [p for p in clean.split("/") if p]
        if len(parts) >= 3:
            return status_for_send(parts[1], parts[2], method)
        return "Calling remote command"
    if clean in _PATH_STATUS:
        return _PATH_STATUS[clean]
    if clean.startswith("/chloe/"):
        return f"{_METHOD_STATUS_VERB.get(method.upper(), 'Calling')} Chloe"
    if clean.startswith("/admin/"):
        return f"{_METHOD_STATUS_VERB.get(method.upper(), 'Calling')} admin"
    label = _humanize_words(clean.strip("/").replace("/", " ")) or "request"
    return f"{_METHOD_STATUS_VERB.get(method.upper(), 'Calling')} {label}"


async def emit_log(level: str, message: str, *, stack: str | None = None) -> None:
    """Print a short status line to the sidecar log and broadcast to connected UIs."""
    try:
        safe_message = _redact_log_text(message)
        line = f"[{level.upper()}] {safe_message}"
        encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
        try:
            print(line, flush=True)
        except UnicodeEncodeError:
            print(line.encode(encoding, errors="replace").decode(encoding), flush=True)
        if stack and level.upper() in {"EXCEPTION", "ERROR"}:
            tail = _redact_log_text(stack.splitlines()[-1] if stack else "")
            try:
                print(tail, flush=True)
            except UnicodeEncodeError:
                print(tail.encode(encoding, errors="replace").decode(encoding), flush=True)
        await broadcast_ws(_log_payload(level, safe_message, None))
    except Exception:
        # Never let console encoding (Windows charmap) fail a request.
        return


class WsLogHandler(logging.Handler):
    """Forwards Python logging records to the UI over the WebSocket."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            name = record.name or ""
            if name.startswith("uvicorn.access") or name == "uvicorn.access":
                return
            level = record.levelname
            if record.exc_info and record.exc_info[0] is not None:
                level = "EXCEPTION"
            msg = _redact_log_text(record.getMessage())
            # Collapse uvicorn/fastapi chatter into short status lines.
            if name.startswith("uvicorn") or name.startswith("fastapi"):
                if "Started server process" in msg:
                    msg = "Starting HTTP server"
                elif "Waiting for application startup" in msg:
                    msg = "Starting application"
                elif "Application startup complete" in msg:
                    msg = "Application ready"
                elif "Shutting down" in msg:
                    msg = "Shutting down"
                elif "Finished server process" in msg:
                    msg = "HTTP server stopped"
                elif record.levelno < logging.WARNING:
                    return
            payload = _log_payload(level, msg, None)
            loop = asyncio.get_running_loop()
            loop.create_task(broadcast_ws(payload))
        except Exception:
            # Logging must never break the app; drop the record silently.
            pass


def install_ws_logging() -> None:
    handler = WsLogHandler(level=logging.INFO)
    # Root catches app/fastapi logs; "uvicorn" has propagate=False by default,
    # and its children ("uvicorn.error"/"uvicorn.access") propagate into it.
    for name in ("", "uvicorn", "uvicorn.error"):
        logger = logging.getLogger(name)
        if not any(isinstance(h, WsLogHandler) for h in logger.handlers):
            logger.addHandler(handler)
    access = logging.getLogger("uvicorn.access")
    access.handlers.clear()
    access.propagate = False
    access.disabled = True
    access.setLevel(logging.CRITICAL)


def remote_unavailable() -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={
            "error": "remote_unavailable",
            "message": "Remote CultForge APIs are offline. Local routes still work.",
        },
    )


async def presence_bridge_loop() -> None:
    """Hold authenticated remote /v1/ws using sKEY; forward frames to local /ws."""
    global _presence_wake
    try:
        import websockets
    except ImportError:
        await emit_log(
            "WARNING",
            "websockets package missing — presence bridge disabled",
        )
        return

    if _presence_wake is None:
        _presence_wake = asyncio.Event()

    while True:
        token = current_session_key()
        if not token:
            _presence_wake.clear()
            try:
                await asyncio.wait_for(_presence_wake.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                pass
            continue

        url = f"{PRESENCE_WS_URL}?token={token}"
        try:
            await emit_log("INFO", "Connecting presence…")
            headers: dict[str, str] = {}
            if _skey_user_agent:
                headers["User-Agent"] = _skey_user_agent
            if _skey_platform:
                headers["sec-ch-ua-platform"] = _skey_platform
            async with websockets.connect(
                url,
                open_timeout=15,
                additional_headers=headers or None,
            ) as remote:
                await emit_log("SUCCESS", "Presence connected")
                asyncio.create_task(_sync_launcher_state_to_api())

                async def ping_loop() -> None:
                    while True:
                        await asyncio.sleep(PRESENCE_PING_SECONDS)
                        await remote.send(json.dumps({"type": "ping"}))

                ping_task = asyncio.create_task(ping_loop())
                try:
                    async for raw in remote:
                        if current_session_key() != token:
                            break
                        try:
                            frame = json.loads(raw)
                        except json.JSONDecodeError:
                            frame = {"type": "presence_raw", "payload": raw}
                        await broadcast_ws(frame)
                        if isinstance(frame, dict):
                            await _maybe_handle_chloe_action_frame(frame)
                finally:
                    ping_task.cancel()
                    try:
                        await ping_task
                    except asyncio.CancelledError:
                        pass
        except asyncio.CancelledError:
            raise
        except Exception as e:
            await emit_log("WARNING", f"Presence disconnected: {e}")
            await asyncio.sleep(5)


async def guilds_chat_bridge_loop() -> None:
    """Hold authenticated guilds /v1/ws; forward guild.chat.* frames to local /ws."""
    global _guilds_ws_wake, _guilds_remote_ws
    try:
        import websockets
    except ImportError:
        await emit_log(
            "WARNING",
            "websockets package missing — guilds chat bridge disabled",
        )
        return

    if _guilds_ws_wake is None:
        _guilds_ws_wake = asyncio.Event()

    while True:
        token = current_session_key()
        if not token:
            _guilds_ws_wake.clear()
            try:
                await asyncio.wait_for(_guilds_ws_wake.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                pass
            continue

        url = f"{GUILDS_WS_URL}?token={token}"
        try:
            await emit_log("INFO", "Connecting guilds chat…")
            headers: dict[str, str] = {}
            if _skey_user_agent:
                headers["User-Agent"] = _skey_user_agent
            if _skey_platform:
                headers["sec-ch-ua-platform"] = _skey_platform
            async with websockets.connect(
                url,
                open_timeout=15,
                additional_headers=headers or None,
            ) as remote:
                await emit_log("SUCCESS", "Guilds chat connected")
                async with _guilds_remote_lock:
                    _guilds_remote_ws = remote

                async def ping_loop() -> None:
                    while True:
                        await asyncio.sleep(PRESENCE_PING_SECONDS)
                        await remote.send(json.dumps({"type": "ping"}))

                ping_task = asyncio.create_task(ping_loop())
                try:
                    async for raw in remote:
                        if current_session_key() != token:
                            break
                        try:
                            frame = json.loads(raw)
                        except json.JSONDecodeError:
                            frame = {"type": "guild_chat_raw", "payload": raw}
                        event_type = str(frame.get("type") or "")
                        if event_type.startswith("guild.chat") or event_type.startswith(
                            "guild.channel"
                        ):
                            await broadcast_ws(frame)
                finally:
                    ping_task.cancel()
                    try:
                        await ping_task
                    except asyncio.CancelledError:
                        pass
                    async with _guilds_remote_lock:
                        if _guilds_remote_ws is remote:
                            _guilds_remote_ws = None
        except asyncio.CancelledError:
            raise
        except Exception as e:
            async with _guilds_remote_lock:
                _guilds_remote_ws = None
            await emit_log("WARNING", f"Guilds chat disconnected: {e}")
            await asyncio.sleep(5)


async def forward_to_guilds_ws(frame: dict[str, Any]) -> bool:
    """Uplink React guild.channel.join/leave (etc.) to the remote guilds socket."""
    async with _guilds_remote_lock:
        remote = _guilds_remote_ws
    if remote is None:
        return False
    try:
        await remote.send(json.dumps(frame))
        return True
    except Exception as e:
        await emit_log("WARNING", f"Guilds WS uplink failed: {e}")
        return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _presence_task, _presence_wake, _guilds_ws_task, _guilds_ws_wake
    install_ws_logging()
    await emit_log("INFO", f"CultForge client v{APP_VERSION} starting")
    app.state.http = httpx.AsyncClient(
        timeout=httpx.Timeout(30.0, connect=10.0),
        limits=httpx.Limits(
            max_keepalive_connections=20,
            max_connections=40,
            keepalive_expiry=30.0,
        ),
    )
    app.state.sdk = None
    app.state.ready_remote = False
    app.state.remote_error = None
    _presence_wake = asyncio.Event()
    _guilds_ws_wake = asyncio.Event()
    try:
        await emit_log("INFO", "Loading SDK…")
        await emit_log("INFO", f"Remote bases: {describe_bases()}")
        app.state.sdk = await cliX.Client.create(http=app.state.http)
        # Guarantee branding upload ops even on older remote manifests.
        try:
            app.state.sdk._ensure_module_command(
                "guilds",
                "upload_guild_icon",
                "/v1/guilds/{guild_id}/icon",
                "post",
            )
            app.state.sdk._ensure_module_command(
                "guilds",
                "upload_guild_banner",
                "/v1/guilds/{guild_id}/banner",
                "post",
            )
        except Exception:
            pass
        app.state.ready_remote = True
        await emit_log("SUCCESS", "SDK ready")
        load_keys_from_keyring(app.state.sdk)
        if sKEY:
            await emit_log("INFO", "Loaded session from keyring")
        if rKEY:
            await emit_log("INFO", "Loaded registration key from keyring")
    except Exception as e:
        app.state.remote_error = str(e)
        await emit_log(
            "WARNING",
            f"SDK unavailable — running local-only ({e})",
            stack=traceback.format_exc(),
        )
        load_keys_from_keyring(None)

    _presence_task = asyncio.create_task(presence_bridge_loop())
    _guilds_ws_task = asyncio.create_task(guilds_chat_bridge_loop())
    yield
    for task in (_presence_task, _guilds_ws_task):
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    _presence_task = None
    _guilds_ws_task = None
    await emit_log("INFO", "CultForge client shutting down")
    await app.state.http.aclose()


app = FastAPI(title="CultForge Client", version=APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # Dev Vite + Tauri webview origins. Windows WebView2 defaults to
    # http://tauri.localhost (not https) — missing that marks the UI "offline"
    # even while client.exe is healthy and talking to the remote API.
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "http://ipc.localhost",
        "https://ipc.localhost",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|tauri\.localhost|ipc\.localhost)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def loopback_secret_middleware(request: Request, call_next):
    # Browsers preflight cross-origin requests (1420 → sidecar port) without custom
    # headers; rejecting OPTIONS breaks all sidecar fetches and shows offline.
    if request.method == "OPTIONS":
        return await call_next(request)
    expected = _expected_loopback_secret()
    if expected and not _loopback_exempt(request.url.path):
        provided = _request_loopback_secret(request)
        if not provided or not hmac.compare_digest(provided, expected):
            return JSONResponse(
                status_code=403,
                content={"error": "forbidden", "message": "Invalid loopback secret"},
            )
    return await call_next(request)


@app.middleware("http")
async def quiet_status_log_middleware(request: Request, call_next):
    """Replace noisy uvicorn access lines with short status phrases (no query/secrets)."""
    if request.method == "OPTIONS":
        return await call_next(request)
    path = request.url.path
    status_line = status_for_path(path, request.method)
    if status_line:
        await emit_log("INFO", f"{status_line}…")
    response = await call_next(request)
    if status_line and response.status_code >= 400:
        await emit_log(
            "WARNING",
            f"{status_line} failed ({response.status_code})",
        )
    return response


@app.get("/")
async def root(request: Request):
    sdk: cliX.Client | None = request.app.state.sdk
    if sdk is None:
        return {
            "version": APP_VERSION,
            "name": "CultForge Client",
            "remote": False,
            "remote_error": request.app.state.remote_error,
        }
    try:
        await sdk.dispatch("api", "root")
    except Exception as e:
        await emit_log(
            "EXCEPTION",
            f"Remote API check failed: {e}",
            stack=traceback.format_exc(),
        )
    return {"version": APP_VERSION, "name": "CultForge Client", "remote": True}


@app.get("/ping")
async def ping():
    return {"status": "ok"}


@app.get("/health")
async def health(request: Request):
    payload: dict[str, Any] = {
        "local": True,
        "remote": bool(request.app.state.ready_remote),
        "version": APP_VERSION,
    }
    if request.app.state.remote_error:
        payload["remote_error"] = request.app.state.remote_error
    return payload


def _disk_root() -> str:
    """Prefer CULTFORGE_DOWNLOADS_PATH, else APPDATA, else process drive."""
    for key in ("CULTFORGE_DOWNLOADS_PATH", "APPDATA"):
        value = os.environ.get(key, "").strip()
        if value:
            drive = os.path.splitdrive(os.path.abspath(value))[0]
            if drive:
                return drive + os.sep
            return value
    drive = os.path.splitdrive(os.getcwd())[0]
    if drive:
        return drive + os.sep
    return os.getcwd()


_nvidia_cache: tuple[float, tuple[float | None, float | None, float | None]] | None = None
_NVIDIA_CACHE_TTL = 2.5


def _subprocess_hidden_kwargs() -> dict[str, Any]:
    """Avoid flashing a console when spawning Windows CLI helpers (nvidia-smi)."""
    if sys.platform != "win32":
        return {}
    # CREATE_NO_WINDOW = 0x08000000 — available on Python 3.7+ as subprocess constant.
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
    return {"creationflags": flags}


def _nvidia_metrics() -> tuple[float | None, float | None, float | None]:
    """Return (gpu_percent, vram_used_gb, vram_total_gb) or nulls.

    nvidia-smi is a console PE; without CREATE_NO_WINDOW each metrics poll
    flashes a window for ~700ms (Builds performance charts poll every 2s).
    """
    global _nvidia_cache
    now = time.monotonic()
    if _nvidia_cache is not None:
        cached_at, cached_vals = _nvidia_cache
        if now - cached_at < _NVIDIA_CACHE_TTL:
            return cached_vals
    try:
        completed = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=utilization.gpu,memory.used,memory.total",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=1.5,
            check=False,
            **_subprocess_hidden_kwargs(),
        )
        if completed.returncode != 0 or not completed.stdout.strip():
            vals: tuple[float | None, float | None, float | None] = (None, None, None)
            _nvidia_cache = (now, vals)
            return vals
        # Multi-GPU: average utilization, sum VRAM.
        gpu_vals: list[float] = []
        vram_used = 0.0
        vram_total = 0.0
        for line in completed.stdout.strip().splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 3:
                continue
            gpu_vals.append(float(parts[0]))
            vram_used += float(parts[1]) / 1024.0
            vram_total += float(parts[2]) / 1024.0
        if not gpu_vals:
            vals = (None, None, None)
            _nvidia_cache = (now, vals)
            return vals
        vals = (
            round(sum(gpu_vals) / len(gpu_vals), 1),
            round(vram_used, 2),
            round(vram_total, 2),
        )
        _nvidia_cache = (now, vals)
        return vals
    except Exception:
        vals = (None, None, None)
        _nvidia_cache = (now, vals)
        return vals


def collect_system_metrics() -> dict[str, Any]:
    global _io_prev, _metrics_logged_once

    now = time.monotonic()
    mem = psutil.virtual_memory()
    disk_path = _disk_root()
    try:
        disk = psutil.disk_usage(disk_path)
    except Exception:
        disk = psutil.disk_usage("/")

    disk_io = psutil.disk_io_counters()
    net_io = psutil.net_io_counters()

    disk_read_mbs = 0.0
    disk_write_mbs = 0.0
    net_up_kbs = 0.0
    net_down_kbs = 0.0

    if _io_prev is not None and disk_io is not None and net_io is not None:
        elapsed = max(0.001, now - float(_io_prev["t"]))
        disk_read_mbs = max(
            0.0,
            (disk_io.read_bytes - _io_prev["disk_read"]) / elapsed / (1024 * 1024),
        )
        disk_write_mbs = max(
            0.0,
            (disk_io.write_bytes - _io_prev["disk_write"]) / elapsed / (1024 * 1024),
        )
        net_up_kbs = max(
            0.0,
            (net_io.bytes_sent - _io_prev["net_sent"]) / elapsed / 1024,
        )
        net_down_kbs = max(
            0.0,
            (net_io.bytes_recv - _io_prev["net_recv"]) / elapsed / 1024,
        )

    if disk_io is not None and net_io is not None:
        _io_prev = {
            "t": now,
            "disk_read": disk_io.read_bytes,
            "disk_write": disk_io.write_bytes,
            "net_sent": net_io.bytes_sent,
            "net_recv": net_io.bytes_recv,
        }

    gpu_percent, vram_used_gb, vram_total_gb = _nvidia_metrics()

    payload = {
        "ts": time.time(),
        "cpu_percent": round(float(psutil.cpu_percent(interval=None)), 1),
        "ram_used_gb": round(mem.used / (1024**3), 2),
        "ram_total_gb": round(mem.total / (1024**3), 2),
        "disk_used_gb": round(disk.used / (1024**3), 1),
        "disk_total_gb": round(disk.total / (1024**3), 1),
        "disk_read_mbs": round(disk_read_mbs, 2),
        "disk_write_mbs": round(disk_write_mbs, 2),
        "net_up_kbs": round(net_up_kbs, 1),
        "net_down_kbs": round(net_down_kbs, 1),
        "gpu_percent": gpu_percent,
        "vram_used_gb": vram_used_gb,
        "vram_total_gb": vram_total_gb,
    }
    return payload


@app.get("/system/metrics")
async def system_metrics():
    global _metrics_logged_once
    try:
        payload = await asyncio.to_thread(collect_system_metrics)
        if not _metrics_logged_once:
            _metrics_logged_once = True
            await emit_log(
                "INFO",
                f"System metrics ready (CPU {payload['cpu_percent']}% · "
                f"RAM {payload['ram_used_gb']}/{payload['ram_total_gb']} GB)",
            )
        return payload
    except Exception as e:
        await emit_log(
            "ERROR",
            f"System metrics failed: {e}",
            stack=traceback.format_exc(),
        )
        return JSONResponse(
            status_code=503,
            content={
                "error": "metrics_unavailable",
                "message": str(e) or "Could not sample host metrics.",
            },
        )


@app.get("/discord/widget/{guild_id}")
async def discord_widget(guild_id: str, request: Request):
    if not guild_id.isdigit() or len(guild_id) < 17:
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_guild_id",
                "message": "Guild ID must be a numeric Discord snowflake.",
            },
        )

    url = f"https://discord.com/api/guilds/{guild_id}/widget.json"
    http: httpx.AsyncClient = request.app.state.http
    try:
        response = await http.get(url)
    except httpx.HTTPError as e:
        await emit_log("WARNING", f"Discord widget fetch failed for {guild_id}: {e}")
        return JSONResponse(
            status_code=502,
            content={
                "error": "fetch_failed",
                "message": "Could not reach Discord widget API.",
            },
        )

    if response.status_code == 404:
        return JSONResponse(
            status_code=404,
            content={
                "error": "widget_disabled",
                "message": "Server widget is disabled or guild not found. Enable it in Discord Server Settings → Widget.",
            },
        )
    if response.status_code == 429:
        return JSONResponse(
            status_code=429,
            content={
                "error": "rate_limited",
                "message": "Discord rate limit reached. Try again shortly.",
            },
        )
    if not response.is_success:
        return JSONResponse(
            status_code=response.status_code,
            content={
                "error": "fetch_failed",
                "message": "Could not load Discord widget.",
            },
        )

    try:
        return response.json()
    except ValueError:
        return JSONResponse(
            status_code=502,
            content={
                "error": "fetch_failed",
                "message": "Discord returned an invalid widget payload.",
            },
        )


# Allowlisted guild media paths only — never an open /v1/guilds/* proxy.
_GUILD_MEDIA_PATH_RE = re.compile(
    r"^"
    r"[^/]+/(?:icon|banner)"
    r"|[^/]+/news/[^/]+/cover"
    r"|[^/]+/events/[^/]+/cover"
    r"|[^/]+/builds/[^/]+/(?:icon|cover)"
    r"|[^/]+/servers/[^/]+/(?:icon|cover)"
    r"|[^/]+/media/[^/]+"
    r"$",
    re.IGNORECASE,
)

_ALLOWED_UPSTREAM_HOSTS = frozenset(
    {
        "api.cultforge.com",
        "auth.cultforge.com",
        "guilds.cultforge.com",
        "invite.cultforge.com",
        "www.cultforge.com",
        "status.cultforge.com",
        "discord.com",
        "cdn.discordapp.com",
        "media.discordapp.net",
    }
)


def _upstream_host_allowed(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    if not host:
        return False
    if host in _ALLOWED_UPSTREAM_HOSTS:
        return True
    if host in ("127.0.0.1", "localhost") and "127.0.0.1" in API_BASE:
        return True
    return host.endswith(".cultforge.com")


async def _get_bytes_allowlisted(
    http: httpx.AsyncClient,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    max_redirects: int = 3,
    allow_avatar_cdn_redirects: bool = False,
) -> tuple[httpx.Response | None, int]:
    """GET bytes without following redirects off the CultForge allowlist.

    Avatar endpoints may 302 to Google/Discord CDNs — set
    ``allow_avatar_cdn_redirects`` for those fetches only.
    """
    current = url
    hdrs = headers or {}

    def _host_ok(target: str) -> bool:
        if _upstream_host_allowed(target):
            return True
        return allow_avatar_cdn_redirects and _is_oauth_provider_avatar_host(target)

    for _ in range(max_redirects + 1):
        if not _host_ok(current):
            return None, 502
        res = await http.get(current, headers=hdrs, follow_redirects=False)
        if res.status_code in (301, 302, 303, 307, 308):
            loc = res.headers.get("location")
            if not loc:
                return None, res.status_code
            nxt = urljoin(current, loc)
            if not _host_ok(nxt):
                await emit_log(
                    "WARNING",
                    f"Blocked off-site upstream redirect: {nxt[:120]}",
                )
                return None, 502
            current = nxt
            continue
        return res, res.status_code
    return None, 502


_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 CultForge-Launcher/2.4"
)


def _avatar_fetch_headers() -> dict[str, str]:
    """Browser-like headers so Cloudflare doesn't 1010 avatar GETs."""
    headers: dict[str, str] = {
        "User-Agent": _skey_user_agent or _BROWSER_UA,
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }
    if _skey_platform:
        headers["sec-ch-ua-platform"] = _skey_platform
    return headers


def _decode_oauth_avatar_url(raw: str | None) -> str:
    """Decode callback ``avatar_url`` (may be percent-encoded once or twice)."""
    text = str(raw or "").strip()
    if not text:
        return ""
    for _ in range(2):
        if "%" not in text:
            break
        decoded = unquote(text)
        if decoded == text:
            break
        text = decoded.strip()
    return text


_PROFILE_AVATAR_RE = re.compile(
    r"^https?://(?:www\.)?api\.cultforge\.com/v1/profile/(.+)/avatar(?:\?.*)?$",
    re.IGNORECASE,
)


def _user_id_from_avatar_url(url: str | None) -> str:
    """Extract ``cf_…`` (or slash-id) from a CultForge profile avatar URL."""
    text = _decode_oauth_avatar_url(url)
    if not text:
        return ""
    match = _PROFILE_AVATAR_RE.match(text)
    if not match:
        return ""
    uid = match.group(1).strip().strip("/")
    try:
        uid = unquote(uid)
    except Exception:
        pass
    if uid.lower().endswith("/avatar"):
        uid = uid[: -len("/avatar")].rstrip("/")
    return uid


def _sidecar_avatar_src(request: Request, user_id: str, *, bust: str = "oauth") -> str:
    base = str(request.base_url).rstrip("/")
    # Keep path-style ids intact; only encode unsafe chars.
    return f"{base}/media/avatar/{quote(user_id, safe='/_-')}?cb={quote(bust, safe='')}"


@app.get("/media/avatar/{user_id:path}")
async def proxy_user_avatar(user_id: str, request: Request) -> Response:
    """Proxy public avatar bytes through the sidecar.

    Direct <img src="https://api.cultforge.com/..."> is often blocked by
    Cloudflare (1010) inside the Tauri webview. The sidecar uses a normal
    browser User-Agent / fingerprint so the image loads.

    CultForge user_ids may contain '/' (e.g. cult__xxxx/1234). Remote must use
    /v1/profile/{user_id:path}/avatar with the slash left intact — percent-encoding
    %2F alone does not fix an unfixed {user_id} route.

    OAuth callback passes ``avatar_url=https://api.cultforge.com/v1/profile/{id}/avatar``
    (URL-encoded in the query). Always resolve display via this proxy.
    """
    uid = unquote(user_id.strip()).removesuffix("/avatar").strip("/")
    if not uid or ".." in uid or len(uid) > 200:
        return JSONResponse(
            status_code=400, content={"error": "missing_user_id"}
        )

    cached = _load_cached_avatar(uid)
    if cached:
        raw, ctype = cached
        return Response(
            content=raw,
            media_type=ctype,
            headers={
                "Cache-Control": "public, max-age=60",
                "Access-Control-Allow-Origin": "*",
                "X-CultForge-Avatar-Source": "local-cache",
            },
        )

    # Prefer slash path (matches {user_id:path}); fall back to %2F segment.
    remote_candidates = [
        f"{API_BASE}/v1/profile/{uid}/avatar",
        f"{API_BASE}/v1/profile/{quote(uid, safe='')}/avatar",
    ]
    headers = _avatar_fetch_headers()
    http: httpx.AsyncClient | None = getattr(request.app.state, "http", None)
    if http is None:
        return JSONResponse(
            status_code=503, content={"error": "http_unavailable"}
        )
    last_status = 404
    try:
        for remote in remote_candidates:
            res, last_status = await _get_bytes_allowlisted(
                http,
                remote,
                headers=headers,
                allow_avatar_cdn_redirects=True,
            )
            if res is not None and res.status_code < 400 and res.content:
                ctype = res.headers.get("content-type") or "application/octet-stream"
                if not ctype.startswith("image/") and "octet-stream" not in ctype:
                    continue
                _cache_avatar_bytes(uid, res.content, ctype)
                return Response(
                    content=res.content,
                    media_type=ctype,
                    headers={
                        "Cache-Control": "public, max-age=300",
                        "Access-Control-Allow-Origin": "*",
                        "X-CultForge-Avatar-Source": "remote",
                    },
                )
    except Exception as e:
        await emit_log("WARNING", f"Avatar proxy failed for {uid}: {e}")
        return JSONResponse(
            status_code=502, content={"error": "avatar_fetch_failed"}
        )
    await emit_log(
        "WARNING",
        f"Avatar proxy miss for {uid!r} remote_status={last_status}",
    )
    return JSONResponse(
        status_code=last_status if last_status >= 400 else 404,
        content={"error": "avatar_not_found"},
    )


@app.get("/media/guilds/{media_path:path}")
async def proxy_guilds_host_media(media_path: str, request: Request) -> Response:
    """Proxy allowlisted guild media through the sidecar (icon/banner/covers).

    Bytes are cached on disk under CultForge/guild-media-cache so navigation
    remounts do not re-hit guilds.cultforge.com every time.
    """
    path = media_path.strip().strip("/")
    if not path or ".." in path.split("/") or not _GUILD_MEDIA_PATH_RE.match(path):
        return JSONResponse(
            status_code=400, content={"error": "invalid_guild_media_path"}
        )

    # Optional ?fresh=1 bypasses disk cache after an icon/banner upload.
    fresh = str(request.query_params.get("fresh") or "").strip() in (
        "1",
        "true",
        "yes",
    )
    if not fresh:
        cached = _load_cached_guild_media(path)
        if cached:
            raw, ctype = cached
            return Response(
                content=raw,
                media_type=ctype,
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "Access-Control-Allow-Origin": "*",
                    "X-CultForge-Guild-Media-Source": "local-cache",
                },
            )

    remote = f"{GUILDS_BASE}/v1/guilds/{path}"
    headers: dict[str, str] = {}
    if _skey_user_agent:
        headers["User-Agent"] = _skey_user_agent
    if _skey_platform:
        headers["sec-ch-ua-platform"] = _skey_platform
    http: httpx.AsyncClient | None = getattr(request.app.state, "http", None)
    if http is None:
        return JSONResponse(
            status_code=503, content={"error": "http_unavailable"}
        )
    try:
        res, status = await _get_bytes_allowlisted(http, remote, headers=headers)
        if res is not None and status < 400 and res.content:
            ctype = res.headers.get("content-type") or "application/octet-stream"
            _cache_guild_media_bytes(path, res.content, ctype)
            return Response(
                content=res.content,
                media_type=ctype,
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "Access-Control-Allow-Origin": "*",
                    "X-CultForge-Guild-Media-Source": "remote",
                },
            )
        # Stale cache fallback if remote blips.
        stale = _load_cached_guild_media(path)
        if stale:
            raw, ctype = stale
            return Response(
                content=raw,
                media_type=ctype,
                headers={
                    "Cache-Control": "public, max-age=3600",
                    "Access-Control-Allow-Origin": "*",
                    "X-CultForge-Guild-Media-Source": "stale-cache",
                },
            )
        return JSONResponse(
            status_code=status if status >= 400 else 404,
            content={"error": "guild_media_not_found"},
        )
    except Exception as e:
        await emit_log("WARNING", f"Guild media proxy failed for {path}: {e}")
        stale = _load_cached_guild_media(path)
        if stale:
            raw, ctype = stale
            return Response(
                content=raw,
                media_type=ctype,
                headers={
                    "Cache-Control": "public, max-age=3600",
                    "Access-Control-Allow-Origin": "*",
                    "X-CultForge-Guild-Media-Source": "stale-cache",
                },
            )
        return JSONResponse(
            status_code=502, content={"error": "guild_media_fetch_failed"}
        )


@app.get("/media/guild/{guild_id}/{kind}")
async def proxy_guild_branding(
    guild_id: str, kind: str, request: Request
) -> Response:
    """Compat wrapper for icon/banner → /media/guilds/{id}/{kind}."""
    asset = kind.strip().lower()
    if asset not in ("icon", "banner"):
        return JSONResponse(
            status_code=400, content={"error": "invalid_guild_media"}
        )
    return await proxy_guilds_host_media(f"{guild_id}/{asset}", request)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, client_id: str = "default"):
    expected = _expected_loopback_secret()
    if expected:
        provided = (websocket.query_params.get(LOOPBACK_QUERY) or "").strip()
        if not provided or not hmac.compare_digest(provided, expected):
            await websocket.close(code=1008)
            return
    await websocket.accept()
    ws_connections.add(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            # React may uplink guild channel join/leave for room subscriptions.
            try:
                frame = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(frame, dict):
                continue
            event_type = str(frame.get("type") or "")
            if event_type.startswith("guild.channel") or event_type.startswith(
                "guild.chat"
            ):
                await forward_to_guilds_ws(frame)
    except WebSocketDisconnect:
        pass
    finally:
        ws_connections.discard(websocket)


async def broadcast_ws(payload: dict[str, Any]) -> None:
    dead: list[WebSocket] = []
    for connection in list(ws_connections):
        try:
            await connection.send_json(payload)
        except Exception:
            dead.append(connection)
    for connection in dead:
        ws_connections.discard(connection)


_DEFAULT_OAUTH_AVATAR = (
    "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y"
)

# Provider CDNs used only to seed the local avatar cache after OAuth.
_OAUTH_AVATAR_HOST_SUFFIXES = (
    "googleusercontent.com",
    "ggpht.com",
    "google.com",
    "discordapp.com",
    "discord.com",
    "cdn.discordapp.com",
    "media.discordapp.net",
    "githubusercontent.com",
    "gravatar.com",
)


def _is_http_url(value: str | None) -> bool:
    text = (value or "").strip()
    return text.startswith("http://") or text.startswith("https://")


def _is_cultforge_hosted_avatar(url: str | None) -> bool:
    text = (url or "").strip().lower()
    if not text:
        return False
    return "api.cultforge.com" in text and "/v1/profile/" in text and "/avatar" in text


def _is_oauth_provider_avatar_host(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    if not host:
        return False
    for suffix in _OAUTH_AVATAR_HOST_SUFFIXES:
        if host == suffix or host.endswith("." + suffix):
            return True
    return False


def _prefer_display_avatar(
    cultforge_avatar: str | None,
    oauth_avatar: str | None,
) -> str:
    """Pick the CultForge profile avatar URL from OAuth callback / profile.

    OAuth callback ``avatar_url`` is the hosted profile avatar, e.g.
    ``https://api.cultforge.com/v1/profile/cf_…/avatar`` (URL-encoded in the
    query string). Prefer that over empty profile fields.
    """
    oauth = _decode_oauth_avatar_url(oauth_avatar)
    cult = _decode_oauth_avatar_url(cultforge_avatar)
    if _is_http_url(oauth):
        return oauth
    if _is_http_url(cult):
        return cult
    return cult or oauth


async def _seed_local_avatar_from_url(
    http: httpx.AsyncClient,
    user_id: str,
    url: str | None,
) -> bool:
    """Download CultForge profile avatar bytes into the sidecar cache."""
    uid = (user_id or "").strip()
    src = _decode_oauth_avatar_url(url)
    if not uid or not _is_http_url(src):
        return False
    if _load_cached_avatar(uid):
        return True

    headers = _avatar_fetch_headers()
    try:
        res, status = await _get_bytes_allowlisted(
            http,
            src,
            headers=headers,
            allow_avatar_cdn_redirects=True,
        )
        if res is None or status >= 400 or not res.content:
            # Fall back to the canonical profile avatar path.
            remote = f"{API_BASE}/v1/profile/{uid}/avatar"
            res, status = await _get_bytes_allowlisted(
                http,
                remote,
                headers=headers,
                allow_avatar_cdn_redirects=True,
            )
        if res is None or status >= 400 or not res.content:
            return False
        ctype = res.headers.get("content-type") or "application/octet-stream"
        if not ctype.startswith("image/") and "octet-stream" not in ctype:
            return False
        _cache_avatar_bytes(uid, res.content, ctype)
        await emit_log(
            "INFO",
            f"Seeded avatar cache for {uid!r} bytes={len(res.content)}",
        )
        return True
    except Exception as exc:
        await emit_log(
            "WARNING",
            f"Avatar seed failed for {uid!r}: {exc}",
        )
    return False


def _callback_avatar_src(
    request: Request,
    *,
    user_id: str,
    cultforge_avatar: str,
    oauth_avatar: str | None,
) -> str:
    """Avatar URL for the browser callback page.

    Never point <img> at api.cultforge.com directly (Cloudflare 1010). Always
    use the sidecar ``/media/avatar/{user_id}`` proxy when we know the id —
    including when OAuth ``avatar_url`` is the hosted profile avatar URL.
    """
    preferred = _prefer_display_avatar(cultforge_avatar, oauth_avatar)
    uid = (user_id or "").strip() or _user_id_from_avatar_url(preferred)
    if uid:
        return _sidecar_avatar_src(request, uid, bust="oauth")
    if preferred and not _is_cultforge_hosted_avatar(preferred):
        return preferred
    return _DEFAULT_OAUTH_AVATAR


def _as_dict(value: Any) -> dict[str, Any] | None:
    return value if isinstance(value, dict) else None


def _pick_str(obj: dict[str, Any] | None, *keys: str) -> str:
    if not obj:
        return ""
    for key in keys:
        value = obj.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _unwrap_profile_payload(raw: Any) -> dict[str, Any] | None:
    root = _as_dict(raw)
    if not root:
        return None
    for key in ("user", "data", "payload", "profile", "result"):
        nested = _as_dict(root.get(key))
        if not nested:
            continue
        for inner_key in ("user", "data", "profile"):
            deeper = _as_dict(nested.get(inner_key))
            if deeper and (
                deeper.get("username")
                or deeper.get("handle_name")
                or deeper.get("id")
                or deeper.get("user_id")
            ):
                return deeper
        if (
            nested.get("username")
            or nested.get("handle_name")
            or nested.get("id")
            or nested.get("user_id")
            or nested.get("email")
            or nested.get("avatar_url")
        ):
            return nested
    return root


def _normalize_handle(raw: str) -> str:
    handle = raw.strip().lstrip("@")
    return handle


async def _fetch_cultforge_identity(
    sdk: cliX.Client,
) -> dict[str, str]:
    """Best-effort CultForge profile after session OAuth."""
    try:
        raw = await sdk.dispatch("api", "get_my_profile")
    except Exception as exc:
        await emit_log(
            "DEBUG",
            f"auth callback profile fetch failed: {exc}",
        )
        return {}

    profile = _unwrap_profile_payload(raw) or {}
    user_id = _pick_str(profile, "id", "user_id", "uid", "cf_id")
    username = _pick_str(profile, "username", "user_name", "display_name", "name")
    handle = _normalize_handle(
        _pick_str(profile, "handle_name", "handleName", "handle", "title")
    )
    if handle.lower() in {"member", "user", "player"}:
        handle = ""
    avatar = _pick_str(
        profile,
        "avatar_url",
        "avatarUrl",
        "avatar",
        "picture",
        "image_url",
        "google_avatar_url",
    )
    email = _pick_str(profile, "email")
    out: dict[str, str] = {}
    if user_id:
        out["user_id"] = user_id
    if username:
        out["username"] = username
    if handle:
        out["handle_name"] = handle
    if avatar:
        out["avatar_url"] = avatar
    if email:
        out["email"] = email
    return out


def _render_auth_callback_html(
    *,
    ok: bool,
    provider: str,
    username: str,
    handle_name: str,
    avatar_src: str,
    avatar_fallback: str,
    token: str,
    message: str,
) -> str:
    provider_title = html.escape((provider or "oauth").capitalize())
    safe_avatar = html.escape(avatar_src)
    safe_fallback = html.escape(avatar_fallback or _DEFAULT_OAUTH_AVATAR)
    safe_username = html.escape(username or "Forger")
    safe_handle = html.escape(f"@{handle_name}") if handle_name else ""
    token_js = json.dumps(token or "")
    message_js = json.dumps(message or "")
    status_js = "true" if ok else "false"
    headline = f"Welcome, {safe_username}" if ok else "Sign-in failed"
    subcopy = (
        "You're signed in to CultForge. You can close this window and return to the launcher."
        if ok
        else "Something went wrong during authentication. Close this window and try again from the launcher."
    )
    handle_html = (
        f'<p class="handle">{safe_handle}</p>' if safe_handle and ok else ""
    )
    badge_label = "Connected" if ok else "Failed"
    state_class = "ok" if ok else "bad"
    initial = html.escape((username or "C")[:1].upper())

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CultForge · Authentication</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root {{
      --bg: #000000;
      --surface: #0a0a0a;
      --elevated: #0f0f0f;
      --text: #f4f7fb;
      --muted: #6e7a8a;
      --secondary: #a8b4c4;
      --border: rgba(255,255,255,0.10);
      --mint: #1ee396;
      --mint-soft: rgba(30, 227, 150, 0.14);
      --mint-glow: rgba(30, 227, 150, 0.22);
      --error: #eb5d62;
      --error-soft: rgba(235, 93, 98, 0.14);
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    html, body {{ min-height: 100%; }}
    body {{
      font-family: Inter, system-ui, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(900px 480px at 50% -10%, var(--mint-glow), transparent 55%),
        radial-gradient(700px 420px at 80% 110%, rgba(90, 165, 255, 0.08), transparent 50%),
        var(--bg);
      display: grid;
      place-items: center;
      padding: 28px 16px;
    }}
    .shell {{
      width: min(420px, 100%);
      animation: rise 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }}
    @keyframes rise {{
      from {{ opacity: 0; transform: translateY(14px) scale(0.985); }}
      to {{ opacity: 1; transform: none; }}
    }}
    .brand {{
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 18px;
    }}
    .mark {{
      width: 22px;
      height: 22px;
      border-radius: 7px;
      background:
        radial-gradient(circle at 30% 30%, #6dffc0, transparent 45%),
        linear-gradient(135deg, #0d3d2c, #1ee396);
      box-shadow: 0 0 0 1px rgba(30, 227, 150, 0.35);
    }}
    .brand-name {{
      font-family: Sora, Inter, sans-serif;
      font-weight: 700;
      letter-spacing: 0.04em;
      font-size: 13px;
      text-transform: uppercase;
      color: var(--secondary);
    }}
    .card {{
      background: linear-gradient(180deg, var(--elevated), var(--surface));
      border: 1px solid var(--border);
      border-radius: 22px;
      padding: 28px 24px 22px;
      text-align: center;
      box-shadow:
        0 24px 60px rgba(0,0,0,0.45),
        inset 0 1px 0 rgba(255,255,255,0.04);
    }}
    .avatar {{
      width: 92px;
      height: 92px;
      margin: 0 auto 16px;
      border-radius: 999px;
      padding: 3px;
      background: linear-gradient(145deg, var(--mint), rgba(30,227,150,0.15));
      box-shadow: 0 0 24px var(--mint-glow);
    }}
    .card.bad .avatar {{
      background: linear-gradient(145deg, var(--error), rgba(235,93,98,0.2));
      box-shadow: 0 0 24px var(--error-soft);
    }}
    .avatar-inner {{
      width: 100%;
      height: 100%;
      border-radius: inherit;
      overflow: hidden;
      background: #050505;
      display: grid;
      place-items: center;
    }}
    .avatar-inner img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }}
    .avatar-inner .initial {{
      font-family: Sora, Inter, sans-serif;
      font-size: 34px;
      font-weight: 700;
      color: var(--mint);
      line-height: 1;
    }}
    .card.bad .avatar-inner .initial {{ color: var(--error); }}
    h1 {{
      font-family: Sora, Inter, sans-serif;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }}
    .handle {{
      color: var(--mint);
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 10px;
    }}
    .sub {{
      color: var(--secondary);
      font-size: 13px;
      line-height: 1.45;
      margin: 0 auto 16px;
      max-width: 32ch;
    }}
    .meta {{
      display: flex;
      gap: 8px;
      justify-content: center;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }}
    .chip {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.03);
      color: var(--secondary);
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 600;
    }}
    .chip.status {{
      background: var(--mint-soft);
      border-color: rgba(30, 227, 150, 0.28);
      color: var(--mint);
    }}
    .card.bad .chip.status {{
      background: var(--error-soft);
      border-color: rgba(235, 93, 98, 0.28);
      color: var(--error);
    }}
    .dot {{
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: currentColor;
      box-shadow: 0 0 8px currentColor;
    }}
    .hint {{
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.01em;
    }}
  </style>
</head>
<body>
  <div class="shell">
    <div class="brand" aria-hidden="true">
      <div class="mark"></div>
      <div class="brand-name">CultForge</div>
    </div>
    <main class="card {state_class}">
      <div class="avatar">
        <div class="avatar-inner">
          <img
            id="cf-avatar"
            src="{safe_avatar}"
            alt=""
            referrerpolicy="no-referrer"
            data-fallback="{safe_fallback}"
            data-initial="{initial}"
          />
        </div>
      </div>
      <h1>{headline}</h1>
      {handle_html}
      <p class="sub">{html.escape(subcopy)}</p>
      <div class="meta">
        <span class="chip status"><span class="dot"></span>{badge_label}</span>
        <span class="chip">via {provider_title}</span>
      </div>
      <p class="hint">Return to the CultForge launcher to continue.</p>
    </main>
  </div>
  <script>
    (function () {{
      var img = document.getElementById("cf-avatar");
      if (!img) return;
      var stage = 0;
      img.addEventListener("error", function () {{
        if (stage === 0) {{
          stage = 1;
          var fb = img.getAttribute("data-fallback") || "";
          if (fb && fb !== img.getAttribute("src")) {{
            img.setAttribute("src", fb);
            return;
          }}
        }}
        var initial = img.getAttribute("data-initial") || "C";
        var span = document.createElement("span");
        span.className = "initial";
        span.textContent = initial;
        img.replaceWith(span);
      }});
    }})();
    if ({status_js} && window.__TAURI__) {{
      setTimeout(() => {{
        try {{
          const currentWindow = window.__TAURI__.webviewWindow.getCurrentWindow();
          window.__TAURI__.event.emit('oauth-complete', {{
            token: {token_js},
            message: {message_js}
          }});
          currentWindow.close();
        }} catch (_) {{}}
      }}, 1600);
    }}
  </script>
</body>
</html>
"""


@app.get("/auth/callback")
async def auth_callback(
    request: Request,
    status: bool,
    provider: str,
    name: str | None = None,
    email: str | None = None,
    token: str | None = None,
    message: str | None = None,
    avatar_url: str | None = None,
):
    message_str = str(message or "")
    token_str = str(token or "")
    await emit_log(
        "INFO" if status else "WARNING",
        f"Sign-in via {provider}: {'ok' if status else 'failed'}"
        + (f" ({message_str})" if message_str and not status else ""),
    )

    sdk: cliX.Client | None = request.app.state.sdk
    token_kind = "unknown"
    identity: dict[str, str] = {}

    if status and token_str and sdk is not None:
        ua, platform = _fingerprint_from_request(request)
        token_kind = sdk.apply_oauth_token(
            token_str,
            message_str,
            user_agent=ua,
            platform=platform,
        )
        if token_kind == "register":
            set_register_key(token_str, sdk=sdk)
            await emit_log("INFO", "OAuth registration_intent stored as rKEY")
        elif token_kind == "session":
            set_session_key(
                token_str,
                user_agent=ua,
                platform=platform,
                sdk=sdk,
            )
            await broadcast_ws({"type": "session_ready", "status": True})
            await emit_log(
                "INFO",
                f"OAuth session stored as sKEY fingerprint_ua="
                f"{'yes' if ua else 'no'} platform={'yes' if platform else 'no'}",
            )
            identity = await _fetch_cultforge_identity(sdk)
            if identity:
                await emit_log(
                    "INFO",
                    "Auth callback enriched with CultForge profile "
                    f"user={identity.get('username') or '-'} "
                    f"handle={identity.get('handle_name') or '-'}",
                )
        else:
            await emit_log("WARNING", f"OAuth token kind unknown ({token_kind})")

    # Prefer CultForge identity; fall back to OAuth provider payload.
    # OAuth ``avatar_url`` is the hosted profile avatar URL (often still
    # percent-encoded in the callback query): decode + extract user id.
    oauth_avatar_decoded = _decode_oauth_avatar_url(avatar_url)
    username = identity.get("username") or (name or "").strip() or "Forger"
    handle_name = identity.get("handle_name") or ""
    profile_email = identity.get("email") or email
    profile_avatar = identity.get("avatar_url") or ""
    user_id = (
        identity.get("user_id")
        or _user_id_from_avatar_url(oauth_avatar_decoded)
        or _user_id_from_avatar_url(profile_avatar)
        or ""
    )
    preferred_avatar = _prefer_display_avatar(profile_avatar, oauth_avatar_decoded)

    # Seed local avatar cache from the OAuth/profile avatar URL so the
    # launcher `/media/avatar/{user_id}` proxy works after sign-in.
    http: httpx.AsyncClient | None = getattr(request.app.state, "http", None)
    if status and user_id and http is not None and preferred_avatar:
        await _seed_local_avatar_from_url(http, user_id, preferred_avatar)

    display_avatar = _callback_avatar_src(
        request,
        user_id=user_id,
        cultforge_avatar=profile_avatar,
        oauth_avatar=oauth_avatar_decoded,
    )
    avatar_fallback = (
        _sidecar_avatar_src(request, user_id, bust="oauth-fb")
        if user_id
        else _DEFAULT_OAUTH_AVATAR
    )

    html_content = _render_auth_callback_html(
        ok=bool(status),
        provider=provider,
        username=username,
        handle_name=handle_name,
        avatar_src=display_avatar,
        avatar_fallback=avatar_fallback,
        token=token_str,
        message=message_str,
    )

    global _oauth_pending
    # Always hand the launcher a sidecar-proxied avatar when we know the uid —
    # never raw api.cultforge.com (CF 1010 in the webview).
    if user_id:
        display_avatar_for_client = _sidecar_avatar_src(
            request, user_id, bust="oauth"
        )
    else:
        display_avatar_for_client = preferred_avatar or ""
    _oauth_pending = {
        "type": "oauth_callback",
        "status": status,
        "message": message_str,
        "avatar_url": display_avatar_for_client
        or preferred_avatar
        or profile_avatar
        or oauth_avatar_decoded,
        "email": profile_email,
        "name": username,
        "username": identity.get("username") or name,
        "handle_name": handle_name or None,
        "handle": f"@{handle_name}" if handle_name else None,
        "user_id": user_id or None,
        "token_kind": token_kind,
        "provider": provider,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    # Always notify the launcher (do not gate on message text — e.g.
    # "Authenticated Succesfully!" has no "oauth" substring).
    # Never broadcast the JWT — the SDK already holds it in-process.
    await broadcast_ws(dict(_oauth_pending))

    return HTMLResponse(
        content=html_content,
        status_code=status_code.HTTP_200_OK
        if status
        else status_code.HTTP_400_BAD_REQUEST,
    )


@app.post("/auth/session")
async def set_session(request: Request) -> JSONResponse:
    """Persist CultForge app_session JWT as sKEY (keyring + memory + SDK)."""
    sdk: cliX.Client | None = request.app.state.sdk
    if sdk is None:
        return remote_unavailable()
    try:
        body = await request.json()
    except Exception:
        body = {}
    token = body.get("token") if isinstance(body, dict) else None
    if not isinstance(token, str) or not token.strip():
        return JSONResponse(
            status_code=400,
            content={"status": False, "message": "token required"},
        )
    # Prefer fingerprint already bound during /auth/callback; do not clear it.
    fp = sdk.get_session_fingerprint() if sdk is not None else {}
    ua = fp.get("user_agent") if isinstance(fp, dict) else None
    plat = fp.get("platform") if isinstance(fp, dict) else None
    if not ua:
        ua = _skey_user_agent
    if not plat:
        plat = _skey_platform
    set_session_key(
        token.strip(),
        user_agent=ua if isinstance(ua, str) else None,
        platform=plat if isinstance(plat, str) else None,
        sdk=sdk,
    )
    await broadcast_ws({"type": "session_ready", "status": True})
    return JSONResponse(
        content={"status": True, "message": "Session stored in keyring"}
    )


@app.get("/auth/session")
async def get_session(request: Request) -> JSONResponse:
    """Report whether a session is loaded — never return the JWT."""
    token = current_session_key()
    sdk: cliX.Client | None = request.app.state.sdk
    if sdk is not None and not token:
        token = sdk.get_session_token() or ""
    return JSONResponse(
        content={
            "status": True,
            "has_session": bool(token),
        }
    )


@app.get("/auth/oauth/pending")
async def oauth_pending(request: Request) -> JSONResponse:
    """Poll helper while the UI waits for browser OAuth (one-shot consume)."""
    global _oauth_pending
    pending = _oauth_pending
    if pending is None:
        return JSONResponse(
            content={
                "status": True,
                "ready": False,
                "has_session": False,
                "has_register": False,
            }
        )
    _oauth_pending = None
    return JSONResponse(
        content={
            "status": True,
            "ready": True,
            "oauth": pending,
            "has_session": pending.get("token_kind") == "session",
            "has_register": pending.get("token_kind") == "register",
        }
    )


@app.post("/auth/create_account")
async def create_account(form_data: SignupRequest, request: Request) -> JSONResponse:
    sdk: cliX.Client | None = request.app.state.sdk
    if sdk is None:
        return remote_unavailable()
    form_data.password = hashlib.sha256(form_data.password.encode()).hexdigest()
    data = await sdk.create_account(data=form_data)
    session_token = _extract_session_token(data)
    if data.get("status") and session_token:
        set_session_key(session_token, sdk=sdk)
        clear_register_key(sdk=sdk)
        await broadcast_ws({"type": "session_ready", "status": True})
    code = data.get("code") or 200
    return JSONResponse(status_code=code, content=data)


@app.post("/auth/update_handle")
async def update_handle(form_data: UserHandleUpdateRequest, request: Request) -> JSONResponse:
    sdk: cliX.Client | None = request.app.state.sdk
    if sdk is None:
        return remote_unavailable()
    data = await sdk.update_handle(form_data.new_handle_name)
    code = data.get("code") or 200
    return JSONResponse(status_code=code, content=data)


@app.post("/auth/update_avatar")
async def update_avatar(
    form_data: UserAvatarUpdateRequest, request: Request
) -> JSONResponse:
    sdk: cliX.Client | None = request.app.state.sdk
    if sdk is None:
        return remote_unavailable()
    data = await sdk.update_avatar(
        form_data.avatar_url,
        avatar_base64=form_data.avatar_base64,
        content_type=form_data.content_type,
    )
    code = data.get("code") or 200
    mode = (
        "base64"
        if form_data.avatar_base64
        else ("url" if form_data.avatar_url else "clear")
    )
    if data.get("status") is True:
        uid = _user_id_from_avatar_payload(data)
        if form_data.avatar_base64:
            raw = _decode_avatar_base64(form_data.avatar_base64)
            if raw and uid:
                ctype = (form_data.content_type or "").strip() or "image/png"
                _cache_avatar_bytes(uid, raw, ctype)
                await emit_log(
                    "INFO",
                    f"Cached avatar locally for {uid!r} bytes={len(raw)}",
                )
        elif not form_data.avatar_url:
            # Explicit clear
            if uid:
                _clear_cached_avatar(uid)
            else:
                _clear_cached_avatar()
    await emit_log(
        "INFO" if data.get("status") is True else "WARNING",
        f"update_avatar mode={mode} status={data.get('status')} "
        f"code={code} message={data.get('message')}",
    )
    return JSONResponse(status_code=code, content=data)


@app.post("/auth/delete_account")
async def delete_account(
    form_data: AccountDeleteRequest, request: Request
) -> JSONResponse:
    sdk: cliX.Client | None = request.app.state.sdk
    if sdk is None:
        return remote_unavailable()
    data = await sdk.delete_account(
        confirm=form_data.confirm,
        delete_owned_guilds=form_data.delete_owned_guilds,
        password=form_data.password,
    )
    if data.get("status") is True:
        clear_session_key(sdk=sdk)
        clear_register_key(sdk=sdk)
        await broadcast_ws({"type": "session_cleared", "status": True})
    code = data.get("code") or 200
    return JSONResponse(status_code=code, content=data)


@app.get("/logout")
async def logout(request: Request):
    sdk: cliX.Client | None = request.app.state.sdk
    data: dict[str, Any] = {
        "status": True,
        "message": "Logout Successfull !",
        "code": 200,
    }
    if sdk is not None:
        try:
            data = await sdk.logout()
        except Exception as e:
            data = {
                "status": False,
                "message": "Remote logout failed",
                "data": {"debug": str(e)},
                "code": 500,
            }
    clear_session_key(sdk=sdk)
    clear_register_key(sdk=sdk)
    await broadcast_ws({"type": "session_cleared", "status": True})
    code = data.get("code") or 200
    return JSONResponse(status_code=code, content=data)


LOBBY_AUDIO_STATIC = f"{API_BASE}/static/music/theme.mp3"


@app.get("/music/lobby")
async def music_lobby_theme() -> JSONResponse:
    """Proxy CultForge lobby theme metadata + lyrics (public)."""
    try:
        http = getattr(getattr(app, "state", None), "http", None)
        url = f"{API_BASE}/v1/music/lobby"
        if http is None:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                response = await client.get(url)
                data = response.json()
                code = response.status_code
        else:
            response = await http.get(url)
            data = response.json()
            code = response.status_code
        if not isinstance(data, dict):
            data = {"status": True, "data": data}
        return JSONResponse(status_code=code, content=data)
    except Exception as exc:
        await emit_log("WARNING", f"Lobby music catalog failed: {exc}")
        return JSONResponse(
            status_code=502,
            content={
                "status": False,
                "message": "Lobby music catalog unreachable",
                "code": 502,
            },
        )


@app.get("/music/lobby/audio")
async def music_lobby_audio(request: Request):
    """Same-origin MP3 proxy — remote static file has no CORS for Web Audio."""
    if not _upstream_host_allowed(LOBBY_AUDIO_STATIC):
        return JSONResponse(
            status_code=502,
            content={"status": False, "message": "Lobby audio host not allowlisted"},
        )
    http: httpx.AsyncClient | None = getattr(request.app.state, "http", None)
    owns = http is None
    client = http or httpx.AsyncClient(timeout=90.0)
    try:
        res, status = await _get_bytes_allowlisted(client, LOBBY_AUDIO_STATIC)
        if res is None or status >= 400 or not res.content:
            return JSONResponse(
                status_code=502,
                content={"status": False, "message": "Lobby audio upstream failed"},
            )
        headers: dict[str, str] = {"Cache-Control": "public, max-age=86400"}
        length = res.headers.get("content-length")
        if length:
            headers["Content-Length"] = length
        return Response(
            content=res.content,
            media_type="audio/mpeg",
            headers=headers,
        )
    except Exception as exc:
        await emit_log("WARNING", f"Lobby audio proxy failed: {exc}")
        return JSONResponse(
            status_code=502,
            content={"status": False, "message": "Lobby audio upstream failed"},
        )
    finally:
        if owns:
            await client.aclose()


@app.get("/chloe/prefs")
async def chloe_local_prefs() -> JSONResponse:
    return JSONResponse(
        content={"status": True, "data": _read_launcher_prefs(), "code": 200}
    )


@app.post("/chloe/prefs")
async def chloe_set_local_pref(request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    key = str(body.get("key") or "").strip()
    if not key:
        return JSONResponse(
            status_code=400,
            content={"status": False, "message": "key required", "code": 400},
        )
    prefs = _read_launcher_prefs()
    prefs[key] = body.get("value", True)
    _write_launcher_prefs(prefs)
    await _sync_launcher_state_to_api()
    return JSONResponse(content={"status": True, "data": prefs, "code": 200})


@app.post("/chloe/last-played")
async def chloe_record_last_played(request: Request) -> JSONResponse:
    """Launcher UI calls this when a build/server session starts."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    prefs = _read_launcher_prefs()
    entry = dict(body)
    entry.setdefault("at", datetime.now(timezone.utc).isoformat())
    prefs["last_played"] = entry
    _write_launcher_prefs(prefs)
    await _sync_launcher_state_to_api()
    return JSONResponse(
        content={"status": True, "data": prefs["last_played"], "code": 200}
    )


@app.get("/chloe/actions/pending")
async def chloe_pending_actions() -> JSONResponse:
    code, data = await _chloe_api(
        "GET",
        "/v1/chloe/actions/pending",
        command="list_your_pending_chloe_actions",
    )
    return JSONResponse(status_code=code, content=data)


@app.post("/chloe/actions/{action_id}/confirm")
async def chloe_confirm_action(action_id: str) -> JSONResponse:
    code, data = await _chloe_api(
        "POST",
        f"/v1/chloe/actions/{action_id}/confirm",
        command="confirm_a_pending_chloe_action",
        json_body={"action_id": action_id, "id": action_id},
    )
    if not isinstance(data, dict):
        data = {"status": False, "message": "Invalid response", "code": code}
    if data.get("execute_local"):
        tool = str(data.get("tool") or "")
        args = data.get("args") if isinstance(data.get("args"), dict) else {}
        args = {**args, "action_id": action_id}
        ok, message, result_data = _apply_sidecar_chloe_tool(tool, args)
        try:
            await _report_chloe_action_result(action_id, ok, message, result_data)
        except Exception:
            pass
        data = {
            **data,
            "local_ok": ok,
            "local_message": message,
            "local_data": result_data,
            "code": code,
        }
    return JSONResponse(status_code=code, content=data)


@app.post("/chloe/actions/{action_id}/deny")
async def chloe_deny_action(action_id: str) -> JSONResponse:
    code, data = await _chloe_api(
        "POST",
        f"/v1/chloe/actions/{action_id}/deny",
        command="deny_a_pending_chloe_action",
        json_body={"action_id": action_id, "id": action_id},
    )
    return JSONResponse(status_code=code, content=data)


@app.post("/chloe/actions/{action_id}/execute")
async def chloe_execute_local(action_id: str, request: Request) -> JSONResponse:
    """Apply a confirmed launcher tool locally, then report result to API."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    tool = str(body.get("tool") or "")
    args = body.get("args") if isinstance(body.get("args"), dict) else {}
    args = {**args, "action_id": action_id}
    ok, message, result_data = _apply_sidecar_chloe_tool(tool, args)
    try:
        await _report_chloe_action_result(action_id, ok, message, result_data)
    except Exception:
        pass
    return JSONResponse(
        content={
            "status": True,
            "ok": ok,
            "message": message,
            "data": result_data,
            "code": 200,
        }
    )


@app.get("/chloe/inventory")
async def chloe_get_inventory() -> JSONResponse:
    inv = _inventory_from_prefs()
    return JSONResponse(content={"status": True, "data": inv, "code": 200})


@app.post("/chloe/inventory")
async def chloe_set_inventory(request: Request) -> JSONResponse:
    """Launcher UI calls this when local builds/mods change."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    prefs = _read_launcher_prefs()
    extra_mods: list[Any] = []
    if isinstance(body, list):
        builds_raw = body
    elif isinstance(body, dict):
        builds_raw = (
            body.get("installed_builds")
            or body.get("builds")
            or body.get("currentBuilds")
            or []
        )
        extra_mods = body.get("installed_mods") or body.get("mods") or []
    else:
        builds_raw = []
    prefs["installed_builds"] = _normalize_installed_builds(builds_raw)
    if isinstance(extra_mods, list):
        prefs["installed_mods"] = [
            (
                str(m.get("slug") or m.get("name") or m).strip()
                if isinstance(m, dict)
                else str(m).strip()
            )
            for m in extra_mods
            if (m.get("slug") or m.get("name") if isinstance(m, dict) else m)
        ]
    _write_launcher_prefs(prefs)
    await _sync_launcher_state_to_api()
    inv = _inventory_from_prefs(prefs)
    return JSONResponse(content={"status": True, "data": inv, "code": 200})


@app.get("/chloe/tools")
async def chloe_tools_catalog() -> JSONResponse:
    """Proxy Chloe tool catalog for launcher LLM adapters (requires session)."""
    code, data = await _chloe_api(
        "GET",
        "/v1/chloe/tools",
        require_session=True,
    )
    return JSONResponse(status_code=code, content=data)


@app.get("/chloe/system-prompt")
async def chloe_system_prompt_proxy() -> JSONResponse:
    """Proxy Chloe system prompt for launcher LLM adapters (requires session)."""
    code, data = await _chloe_api(
        "GET",
        "/v1/chloe/system-prompt",
        command="chloe_system_prompt_for_launcher_llm_(e.g._user_gemini_key)",
        require_session=True,
    )
    return JSONResponse(status_code=code, content=data)


@app.get("/admin/whoami")
async def admin_whoami(request: Request) -> JSONResponse:
    """Platform admin identity + local capability status (Bearer sKEY only)."""
    code, data = await _admin_upstream_json(
        request,
        "GET",
        f"{API_BASE}/v1/admin/whoami",
    )
    if code >= 400:
        # Fallback to auth host for parity with backend docs.
        code, data = await _admin_upstream_json(
            request,
            "GET",
            f"{AUTH_BASE}/v1/admin/whoami",
        )
    if isinstance(data, dict):
        data = {**data, "local": admin_capability_local_status()}
    return JSONResponse(status_code=code, content=data)


@app.post("/admin/step-up")
async def admin_step_up(request: Request) -> JSONResponse:
    """Mint platform admin capability JWT (empty body; recent OAuth session only)."""
    code, data = await _admin_upstream_json(
        request,
        "POST",
        f"{AUTH_BASE}/v1/admin/step-up",
        json_body=None,
    )
    if code < 400:
        token = _extract_capability_token(data)
        if token:
            set_admin_capability(token)
            http: httpx.AsyncClient | None = getattr(request.app.state, "http", None)
            if http is not None:
                try:
                    headers = _api_auth_headers(require_session=True)
                    await _fetch_admin_catalog_remote(http, headers, force=True)
                except Exception as exc:
                    await emit_log("DEBUG", f"Admin catalog refresh after step-up: {exc}")
        if isinstance(data, dict):
            data = {
                **data,
                "local": admin_capability_local_status(),
            }
    return JSONResponse(status_code=code, content=data)


@app.get("/admin/catalog")
async def admin_catalog(request: Request) -> JSONResponse:
    """Staff command map for launcher admin tool binding."""
    try:
        headers = _api_auth_headers(require_session=True)
    except PermissionError as exc:
        return JSONResponse(
            status_code=401,
            content={"status": False, "message": str(exc), "code": 401},
        )
    http: httpx.AsyncClient | None = getattr(request.app.state, "http", None)
    if http is None:
        code, data = await _admin_upstream_json(
            request,
            "GET",
            f"{API_BASE}/v1/admin/catalog",
        )
        return JSONResponse(status_code=code, content=data)
    try:
        await _fetch_admin_catalog_remote(http, headers, force=True)
    except Exception as exc:
        return JSONResponse(
            status_code=502,
            content={
                "status": False,
                "message": f"Admin catalog fetch failed: {exc}",
                "code": 502,
            },
        )
    code, data = await _admin_upstream_json(
        request,
        "GET",
        f"{API_BASE}/v1/admin/catalog",
    )
    return JSONResponse(status_code=code, content=data)


@app.post("/admin/request")
async def admin_request_proxy(request: Request) -> JSONResponse:
    """Catalog-guarded proxy to api.cultforge.com/v1/admin/*."""
    try:
        body = await request.json()
    except Exception:
        body = None
    if not isinstance(body, dict):
        return JSONResponse(
            status_code=400,
            content={"status": False, "message": "JSON body required", "code": 400},
        )
    method = str(body.get("method") or "GET").upper()
    path = str(body.get("path") or "").strip()
    if not path.startswith("/v1/admin/"):
        return JSONResponse(
            status_code=400,
            content={
                "status": False,
                "message": "path must start with /v1/admin/",
                "code": 400,
            },
        )
    try:
        headers = _api_auth_headers(require_session=True)
    except PermissionError as exc:
        return JSONResponse(
            status_code=401,
            content={"status": False, "message": str(exc), "code": 401},
        )
    http: httpx.AsyncClient | None = getattr(request.app.state, "http", None)
    if http is None:
        return JSONResponse(
            status_code=503,
            content={"status": False, "message": "Sidecar HTTP client unavailable", "code": 503},
        )
    try:
        catalog = await _fetch_admin_catalog_remote(http, headers)
    except Exception as exc:
        return JSONResponse(
            status_code=502,
            content={
                "status": False,
                "message": f"Admin catalog unavailable: {exc}",
                "code": 502,
            },
        )
    entry = _find_catalog_entry(method, path, catalog)
    if entry is None:
        return JSONResponse(
            status_code=403,
            content={
                "status": False,
                "message": "Admin path not in staff catalog",
                "code": 403,
            },
        )
    mutate = bool(entry.get("mutate"))
    extra_headers: dict[str, str] = {}
    if mutate:
        if not admin_capability_valid():
            return JSONResponse(
                status_code=403,
                content={
                    "status": False,
                    "message": "Admin step-up required for mutating operations",
                    "code": 403,
                },
            )
        extra_headers = admin_capability_headers()
    query = body.get("query")
    json_body = body.get("body")
    params = query if isinstance(query, dict) else None
    url = f"{API_BASE}{path}"
    merged_headers = {**headers, **extra_headers}
    try:
        response = await http.request(
            method,
            url,
            params=params,
            json=json_body if isinstance(json_body, dict) else None,
            headers=merged_headers,
        )
    except Exception as exc:
        return JSONResponse(
            status_code=502,
            content={
                "status": False,
                "message": f"Admin upstream request failed: {exc}",
                "code": 502,
            },
        )
    if response.status_code == 401 and mutate:
        clear_admin_capability()
    try:
        data = response.json()
    except Exception:
        data = {"status": False, "message": response.text[:240], "code": response.status_code}
    if not isinstance(data, dict):
        data = {"status": True, "data": data, "code": response.status_code}
    return JSONResponse(status_code=response.status_code, content=data)


async def _upstream_json(
    method: str,
    base: str,
    path: str,
    *,
    require_session: bool = True,
) -> JSONResponse:
    """Authenticated JSON proxy to api/guilds hosts (Discover news + guild directory)."""
    try:
        headers = _api_auth_headers(require_session=require_session)
    except PermissionError as exc:
        return JSONResponse(
            status_code=401,
            content={"status": False, "message": str(exc), "code": 401},
        )
    url = f"{base}{path}"
    http = getattr(getattr(app, "state", None), "http", None)
    try:
        if http is None:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.request(method.upper(), url, headers=headers)
        else:
            response = await http.request(method.upper(), url, headers=headers)
        try:
            data = response.json()
        except Exception:
            data = {
                "status": False,
                "message": (response.text or "")[:300],
                "code": response.status_code,
            }
        if not isinstance(data, dict):
            data = {"status": True, "data": data, "code": response.status_code}
        return JSONResponse(status_code=response.status_code, content=data)
    except Exception as exc:
        await emit_log("WARNING", f"Upstream {method} {path} failed: {exc}")
        return JSONResponse(
            status_code=502,
            content={
                "status": False,
                "message": "Upstream service unreachable",
                "data": {"debug": str(exc)},
                "code": 502,
            },
        )


@app.get("/news/feed")
async def news_feed(
    query: str | None = None,
    kinds: str | None = None,
    offset: int = 0,
    limit: int = 30,
) -> JSONResponse:
    from urllib.parse import urlencode

    params: dict[str, Any] = {"offset": int(offset), "limit": int(limit)}
    if query:
        params["query"] = query
    if kinds:
        params["kinds"] = kinds
    return await _upstream_json(
        "GET", API_BASE, f"/v1/news/feed?{urlencode(params)}", require_session=True
    )


@app.get("/updates")
async def list_platform_updates(
    query: str | None = None,
    channel: str | None = None,
    severity: str | None = None,
    offset: int = 0,
    limit: int = 30,
) -> JSONResponse:
    from urllib.parse import urlencode

    params: dict[str, Any] = {"offset": int(offset), "limit": int(limit)}
    if query:
        params["query"] = query
    if channel:
        params["channel"] = channel
    if severity:
        params["severity"] = severity
    return await _upstream_json(
        "GET", API_BASE, f"/v1/updates?{urlencode(params)}", require_session=True
    )


@app.get("/guilds/discover")
async def guilds_discover(
    query: str | None = None,
    tag: str | None = None,
    sort: str = "newest",
    featured: bool = False,
    offset: int = 0,
    limit: int = 50,
) -> JSONResponse:
    from urllib.parse import urlencode

    params: dict[str, Any] = {
        "sort": sort,
        "featured": str(bool(featured)).lower(),
        "offset": int(offset),
        "limit": int(limit),
    }
    if query:
        params["query"] = query
    if tag:
        params["tag"] = tag
    return await _upstream_json(
        "GET",
        GUILDS_BASE,
        f"/v1/guilds/discover?{urlencode(params)}",
        require_session=False,
    )


async def _proxy_guild_branding_upload(
    command: str,
    params: dict[str, Any],
    request: Request,
) -> dict[str, Any]:
    """POST guild icon/banner without depending on SDK operation ids."""
    guild_id = str(params.get("guild_id") or "").strip()
    if not guild_id:
        raise ValueError("guild_id is required")

    kind = "icon" if command == "upload_guild_icon" else "banner"
    body: dict[str, Any] = {}
    b64 = str(params.get("image_base64") or "").strip()
    url = str(params.get("image_url") or "").strip()
    content_type = str(params.get("content_type") or "").strip()
    if b64 and url:
        raise ValueError("Send either image_base64 or image_url, not both")
    if b64:
        body["image_base64"] = b64
        if content_type:
            body["content_type"] = content_type
    elif url:
        body["image_url"] = url
    else:
        raise ValueError("image_base64 or image_url is required")

    headers = _api_auth_headers(require_session=True)
    headers["Content-Type"] = "application/json"
    remote = f"{GUILDS_BASE}/v1/guilds/{quote(guild_id, safe='')}/{kind}"
    http: httpx.AsyncClient | None = getattr(request.app.state, "http", None)
    if http is None:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.post(remote, headers=headers, json=body)
    else:
        response = await http.post(remote, headers=headers, json=body)

    try:
        data = response.json()
    except Exception:
        data = {
            "status": response.is_success,
            "message": (response.text or "")[:400],
            "code": response.status_code,
        }
    if not isinstance(data, dict):
        data = {"status": response.is_success, "data": data, "code": response.status_code}
    if response.status_code >= 400:
        message = (
            data.get("message")
            or data.get("detail")
            or data.get("error")
            or f"HTTP {response.status_code}"
        )
        raise RuntimeError(str(message))
    # Bust in-memory + disk cache for this guild asset.
    media_key = f"{guild_id}/{kind}"
    _guild_media_local_cache.pop(media_key, None)
    try:
        bin_path, meta_path = _guild_media_cache_paths(media_key)
        for path in (bin_path, meta_path):
            try:
                os.remove(path)
            except OSError:
                pass
    except Exception:
        pass
    return data


def _remote_json_body(response: httpx.Response) -> Any:
    try:
        return response.json()
    except Exception:
        return {
            "e": "invalid_json",
            "text": (response.text or "")[:400],
            "code": response.status_code,
            "message": "Invalid JSON from remote",
        }


def _with_http_error(response: httpx.Response, body: Any) -> Any:
    if response.is_success:
        return body
    if isinstance(body, dict):
        out = dict(body)
        out.setdefault("code", response.status_code)
        if "message" not in out and "detail" in out:
            out["message"] = str(out["detail"])
        return out
    return {
        "code": response.status_code,
        "message": str(body) if body is not None else (response.text or "")[:400],
    }


async def _enqueue_agent_command(sdk: cliX.Client, params: dict[str, Any]) -> Any:
    """Always POST /v1/agents/{node_id}/commands — never fall through to GET list."""
    node_id = str(params.get("node_id") or "").strip()
    action = str(params.get("action") or params.get("command") or "").strip()
    if not node_id or not action:
        raise ValueError("node_id and action are required")
    payload = params.get("payload") if isinstance(params.get("payload"), dict) else {}
    body: dict[str, Any] = {"action": action, "payload": payload}
    workload_id = str(params.get("workload_id") or params.get("workloadId") or "").strip()
    if workload_id:
        body["workload_id"] = workload_id
    local_server_id = str(
        params.get("local_server_id")
        or payload.get("local_server_id")
        or payload.get("server_id")
        or ""
    ).strip()
    if local_server_id:
        body["local_server_id"] = local_server_id
    if params.get("confirm") is True or payload.get("confirm") is True:
        body["confirm"] = True
    url = f"{module_base('api')}/v1/agents/{quote(node_id, safe='')}/commands"
    response = await sdk._request("POST", url, json=body)
    data = _with_http_error(response, _remote_json_body(response))
    row = data.get("data") if isinstance(data, dict) else None
    if not isinstance(row, dict):
        row = data if isinstance(data, dict) else None
    command_id = ""
    if isinstance(row, dict):
        command_id = str(row.get("id") or row.get("command_id") or "").strip()
    await emit_log(
        "INFO",
        f"Enqueue POST {action} -> {node_id} id={command_id or 'none'} HTTP {response.status_code}",
    )
    if isinstance(data, list) or isinstance(
        data.get("data") if isinstance(data, dict) else None, list
    ) or isinstance(data.get("commands") if isinstance(data, dict) else None, list):
        raise RuntimeError(
            "Command enqueue returned a list instead of a created command"
        )
    if isinstance(data, dict) and int(data.get("code") or 0) >= 400:
        return data
    if not command_id and response.is_success:
        raise RuntimeError("Command enqueue did not return a command id")
    return data


async def _upsert_agent_workload(sdk: cliX.Client, params: dict[str, Any]) -> Any:
    """Always POST /v1/agents/{node_id}/workloads with desired_state."""
    node_id = str(params.get("node_id") or "").strip()
    if not node_id:
        raise ValueError("node_id is required")
    body = {
        key: value
        for key, value in params.items()
        if key != "node_id" and value is not None
    }
    url = f"{module_base('api')}/v1/agents/{quote(node_id, safe='')}/workloads"
    response = await sdk._request("POST", url, json=body)
    data = _with_http_error(response, _remote_json_body(response))
    desired = str(body.get("desired_state") or "")
    await emit_log(
        "INFO",
        f"Workload POST desired={desired or 'none'} -> {node_id} HTTP {response.status_code}",
    )
    return data


@app.get("/send/{module}/{command}")
@app.post("/send/{module}/{command}")
@app.patch("/send/{module}/{command}")
@app.put("/send/{module}/{command}")
@app.delete("/send/{module}/{command}")
async def send(module: str, command: str, request: Request) -> JSONResponse:
    sdk: cliX.Client | None = request.app.state.sdk
    if sdk is None:
        return remote_unavailable()
    params = dict(request.query_params)
    if request.method.upper() in {"POST", "PUT", "PATCH"}:
        try:
            body = await request.json()
        except Exception:
            body = None
        if isinstance(body, dict):
            for key, value in body.items():
                if value is None:
                    continue
                params[str(key)] = value

    # Branding uploads may be missing from older frozen SDK manifests —
    # proxy them directly so Manage → Branding works without a full re-freeze
    # as long as this client.py is what is running.
    if module == "guilds" and command in {
        "upload_guild_icon",
        "upload_guild_banner",
    }:
        try:
            data = await _proxy_guild_branding_upload(command, params, request)
            return JSONResponse(status_code=200, content=data)
        except PermissionError as e:
            return JSONResponse(
                status_code=401,
                content={"error": "unauthorized", "message": str(e)},
            )
        except Exception as e:
            await emit_log(
                "EXCEPTION",
                f"guild branding upload failed: {e}",
                stack=traceback.format_exc(),
            )
            return JSONResponse(
                status_code=500,
                content={
                    "error": "dispatch_failed",
                    "message": str(e),
                },
            )

    try:
        if module == "api" and command in (
            "enqueue_a_command_for_the_agent_to_poll",
            "enqueue_command_for_a_node",
        ):
            data = await _enqueue_agent_command(sdk, params)
        elif module == "api" and command == "attach_a_workload_to_a_node":
            data = await _upsert_agent_workload(sdk, params)
        else:
            data = await sdk.dispatch(module, command, **params)
    except Exception as e:
        await emit_log(
            "EXCEPTION",
            f"{status_for_send(module, command, request.method)} failed: {e}",
            stack=traceback.format_exc(),
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": "dispatch_failed",
                "message": str(e),
            },
        )
    code = 200
    if isinstance(data, dict) and data.get("redirect") is True:
        # Purposeful remote redirect (e.g. OAuth) — return payload as 200 so
        # the UI can open Location without treating 307 as failure.
        return JSONResponse(status_code=200, content=data)
    if isinstance(data, dict) and "code" in data:
        try:
            code = int(data["code"])
        except (TypeError, ValueError):
            code = 200
    if code in (401, 403) and module == "api" and command == "get_my_profile":
        detail = ""
        if isinstance(data, dict):
            detail = str(
                data.get("message")
                or data.get("detail")
                or data.get("error")
                or ""
            )[:240]
        fp = sdk.get_session_fingerprint() if sdk is not None else {}
        await emit_log(
            "WARNING",
            f"get_my_profile auth failure HTTP {code} detail={detail!r} "
            f"has_token={'yes' if (sdk and sdk.get_session_token()) else 'no'} "
            f"ua={'yes' if (isinstance(fp, dict) and fp.get('user_agent')) else 'no'}",
        )
    return JSONResponse(status_code=code, content=data)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    uvicorn.run(app, host="127.0.0.1", port=port, access_log=False)
