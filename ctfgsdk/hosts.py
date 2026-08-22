"""CultForge remote service bases.

Default: live production hosts (api / auth / invite / guilds).

Local stack (opt-in only via CULTFORGE_USE_LOCAL_API=1):
  api     http://127.0.0.1:8071
  auth    http://127.0.0.1:8072
  invite  http://127.0.0.1:8073
  guilds  http://127.0.0.1:8074

Per-host overrides: CULTFORGE_API_BASE / CULTFORGE_AUTH_BASE /
CULTFORGE_INVITE_BASE / CULTFORGE_GUILDS_BASE, or CULTFORGE_MANIFEST_URL.
"""

from __future__ import annotations

import os

PROD_BASES: dict[str, str] = {
    "api": "https://api.cultforge.com",
    "auth": "https://auth.cultforge.com",
    "invite": "https://invite.cultforge.com",
    "guilds": "https://guilds.cultforge.com",
}

LOCAL_BASES: dict[str, str] = {
    "api": "http://127.0.0.1:8071",
    "auth": "http://127.0.0.1:8072",
    "invite": "http://127.0.0.1:8073",
    "guilds": "http://127.0.0.1:8074",
}

_ENV_KEYS = {
    "api": "CULTFORGE_API_BASE",
    "auth": "CULTFORGE_AUTH_BASE",
    "invite": "CULTFORGE_INVITE_BASE",
    "guilds": "CULTFORGE_GUILDS_BASE",
}


def use_local_api() -> bool:
    """Local hosts only when explicitly requested — never the default."""
    raw = (os.environ.get("CULTFORGE_USE_LOCAL_API") or "").strip().lower()
    return raw in ("1", "true", "yes", "on", "local")


def module_base(module: str) -> str:
    name = (module or "api").strip().lower()
    env_key = _ENV_KEYS.get(name)
    if env_key:
        override = (os.environ.get(env_key) or "").strip().rstrip("/")
        if override:
            return override
    table = LOCAL_BASES if use_local_api() else PROD_BASES
    return table.get(name, table["api"]).rstrip("/")


def http_to_ws(base: str, path: str = "/v1/ws") -> str:
    b = base.rstrip("/")
    if b.startswith("https://"):
        return "wss://" + b[len("https://") :] + path
    if b.startswith("http://"):
        return "ws://" + b[len("http://") :] + path
    if b.startswith("wss://") or b.startswith("ws://"):
        return b + path
    return b + path


def manifest_url() -> str:
    override = (os.environ.get("CULTFORGE_MANIFEST_URL") or "").strip()
    if override:
        return override
    return f"{module_base('api')}/manifest.json"


def describe_bases() -> str:
    mode = "local" if use_local_api() else "prod"
    parts = [f"mode={mode}"]
    for name in ("api", "auth", "invite", "guilds"):
        parts.append(f"{name}={module_base(name)}")
    return " ".join(parts)
