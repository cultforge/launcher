"""OS keyring custody for CultForge session tokens.

sKEY — application session JWT (app_session)
rKEY — registration-intent JWT
sKEY_meta — browser fingerprint headers for HTTP API digest match

Tokens must not live in React state or plaintext local files.
"""

from __future__ import annotations

import json
from typing import Any

import keyring

SERVICE = "CultForge"
ACCOUNT_SKEY = "sKEY"
ACCOUNT_RKEY = "rKEY"
ACCOUNT_SKEY_META = "sKEY_meta"
# Legacy single-blob account used by earlier launcher builds.
ACCOUNT_LEGACY = "app_session"


def get_skey() -> str:
    return (keyring.get_password(SERVICE, ACCOUNT_SKEY) or "").strip()


def set_skey(token: str) -> None:
    token = (token or "").strip()
    if not token:
        clear_skey()
        return
    keyring.set_password(SERVICE, ACCOUNT_SKEY, token)


def clear_skey() -> None:
    try:
        keyring.delete_password(SERVICE, ACCOUNT_SKEY)
    except keyring.errors.PasswordDeleteError:
        pass


def get_rkey() -> str:
    return (keyring.get_password(SERVICE, ACCOUNT_RKEY) or "").strip()


def set_rkey(token: str) -> None:
    token = (token or "").strip()
    if not token:
        clear_rkey()
        return
    keyring.set_password(SERVICE, ACCOUNT_RKEY, token)


def clear_rkey() -> None:
    try:
        keyring.delete_password(SERVICE, ACCOUNT_RKEY)
    except keyring.errors.PasswordDeleteError:
        pass


def get_skey_meta() -> dict[str, str | None]:
    raw = keyring.get_password(SERVICE, ACCOUNT_SKEY_META)
    if not raw:
        return {"user_agent": None, "platform": None}
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return {"user_agent": None, "platform": None}
        return {
            "user_agent": data.get("user_agent")
            if isinstance(data.get("user_agent"), str)
            else None,
            "platform": data.get("platform")
            if isinstance(data.get("platform"), str)
            else None,
        }
    except Exception:
        return {"user_agent": None, "platform": None}


def set_skey_meta(
    *,
    user_agent: str | None = None,
    platform: str | None = None,
) -> None:
    if not user_agent and not platform:
        clear_skey_meta()
        return
    keyring.set_password(
        SERVICE,
        ACCOUNT_SKEY_META,
        json.dumps({"user_agent": user_agent, "platform": platform}),
    )


def clear_skey_meta() -> None:
    try:
        keyring.delete_password(SERVICE, ACCOUNT_SKEY_META)
    except keyring.errors.PasswordDeleteError:
        pass


def migrate_legacy_app_session() -> dict[str, Any] | None:
    """One-time migrate legacy `app_session` blob → sKEY + sKEY_meta."""
    if get_skey():
        return None
    try:
        raw = keyring.get_password(SERVICE, ACCOUNT_LEGACY)
    except Exception:
        return None
    if not isinstance(raw, str) or not raw.strip():
        return None
    token: str | None = None
    user_agent: str | None = None
    platform: str | None = None
    text = raw.strip()
    if text.startswith("{"):
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                t = data.get("token")
                if isinstance(t, str) and t.strip():
                    token = t.strip()
                if isinstance(data.get("user_agent"), str):
                    user_agent = data["user_agent"]
                if isinstance(data.get("platform"), str):
                    platform = data["platform"]
        except Exception:
            return None
    elif text.count(".") >= 2:
        token = text
    if not token:
        return None
    set_skey(token)
    set_skey_meta(user_agent=user_agent, platform=platform)
    try:
        keyring.delete_password(SERVICE, ACCOUNT_LEGACY)
    except keyring.errors.PasswordDeleteError:
        pass
    return {"token": token, "user_agent": user_agent, "platform": platform}
