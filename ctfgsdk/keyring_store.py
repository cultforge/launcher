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
ACCOUNT_ROSTER = "accounts_roster"
# Legacy single-blob account used by earlier launcher builds.
ACCOUNT_LEGACY = "app_session"


def _account_slot(user_id: str) -> str:
    safe = "".join(c for c in (user_id or "") if c.isalnum() or c in "-_")[:80]
    return f"sKEY:{safe}"


def get_account_roster() -> list[dict[str, Any]]:
    raw = keyring.get_password(SERVICE, ACCOUNT_ROSTER)
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict) and x.get("id")]
    except Exception:
        pass
    return []


def _save_roster(rows: list[dict[str, Any]]) -> None:
    keyring.set_password(SERVICE, ACCOUNT_ROSTER, json.dumps(rows))


def stash_account(
    user_id: str,
    *,
    name: str | None = None,
    avatar_url: str | None = None,
) -> bool:
    """Copy current sKEY into a per-user slot and upsert roster metadata."""
    uid = (user_id or "").strip()
    if not uid:
        return False
    token = get_skey()
    if not token:
        return False
    keyring.set_password(SERVICE, _account_slot(uid), token)
    roster = get_account_roster()
    now = __import__("time").time()
    found = False
    for row in roster:
        if str(row.get("id")) == uid:
            row["name"] = name or row.get("name") or uid
            if avatar_url:
                row["avatar_url"] = avatar_url
            row["last_used"] = now
            found = True
            break
    if not found:
        roster.append(
            {
                "id": uid,
                "name": name or uid,
                "avatar_url": avatar_url,
                "last_used": now,
            }
        )
    roster.sort(key=lambda r: float(r.get("last_used") or 0), reverse=True)
    _save_roster(roster[:12])
    return True


def activate_account(user_id: str) -> str | None:
    """Load per-user token into active sKEY. Returns token or None."""
    uid = (user_id or "").strip()
    if not uid:
        return None
    token = (keyring.get_password(SERVICE, _account_slot(uid)) or "").strip()
    if not token:
        return None
    set_skey(token)
    roster = get_account_roster()
    now = __import__("time").time()
    for row in roster:
        if str(row.get("id")) == uid:
            row["last_used"] = now
            break
    _save_roster(roster)
    return token


def forget_account(user_id: str) -> None:
    uid = (user_id or "").strip()
    if not uid:
        return
    try:
        keyring.delete_password(SERVICE, _account_slot(uid))
    except keyring.errors.PasswordDeleteError:
        pass
    roster = [r for r in get_account_roster() if str(r.get("id")) != uid]
    _save_roster(roster)


def list_stashed_account_ids() -> list[str]:
    return [str(r.get("id")) for r in get_account_roster() if r.get("id")]


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
