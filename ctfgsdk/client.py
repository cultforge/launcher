from typing import Any, Dict, Optional
import base64
import json
import re

import httpx
from typing_extensions import deprecated

from .exceptions import ClientError, RemoteUnavailable
from .hosts import manifest_url, module_base
from .schema import (
    AccountDeleteRequest,
    SignupRequest,
    StandardResponse,
    UserAvatarUpdateRequest,
    UserCreateRequest,
    UserHandleUpdateRequest,
)


def jwt_scope(token: str) -> str | None:
    """Best-effort read of JWT payload.scope without verifying the signature."""
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return None
        payload = parts[1]
        pad = "=" * (-len(payload) % 4)
        raw = base64.urlsafe_b64decode(payload + pad)
        data = json.loads(raw.decode("utf-8"))
        scope = data.get("scope")
        return str(scope) if scope is not None else None
    except Exception:
        return None


def extract_session_token(payload: Any) -> str | None:
    """Pull a session JWT out of create_account / login style responses."""
    if not isinstance(payload, dict):
        return None
    for key in ("token", "access_token", "session_token"):
        value = payload.get(key)
        if isinstance(value, str) and value.count(".") >= 2:
            return value
    data = payload.get("data")
    if isinstance(data, dict):
        nested = extract_session_token(data)
        if nested:
            return nested
        inner = data.get("payload")
        if isinstance(inner, dict):
            return extract_session_token(inner)
    nested_payload = payload.get("payload")
    if isinstance(nested_payload, dict):
        return extract_session_token(nested_payload)
    return None


class Client:
    """
    `An Arxt Series Client for CultForge`

    Async HTTP/1.1 & HTTP/2 client for CULTFORGE
    """

    def __init__(
        self,
        schema: Dict,
        http: httpx.AsyncClient | None = None,
    ) -> None:
        self.schema = schema
        if not isinstance(schema, dict):
            raise TypeError("schema must be a dict")
        self._http = http
        self.rToken: str | None = None
        self.sessionToken: str | None = None
        self._session_user_agent: str | None = None
        self._session_platform: str | None = None
        self._validate_schema(schema)

    def _validate_schema(self, schema: Dict) -> None:
        if len(schema) == 0:
            raise ValueError("schema must not be empty")
        self.__skel: Dict = dict()
        self.meta: Dict = schema.pop("&")

        for module, commands in schema.items():
            if module not in self.__skel:
                self.__skel[module] = dict()
                for i, v in commands.items():
                    y = v.get("methods")
                    for j, k in y.items():
                        self.__skel[module][k["id"]] = i

        # Remotes that are already on the unified manifest (v2026.08.08-win+) —
        # guild builds live under guilds.list_guild_builds; only inject the
        # provisional file-manifest route until api ships it.
        self._ensure_api_command(
            "get_build_manifest",
            "/v1/builds/releases/{release_id}/manifest",
        )
        # Guild build catalog mutations (may already exist on newer manifests).
        self._ensure_module_command(
            "guilds",
            "create_guild_build",
            "/v1/guilds/{guild_id}/builds",
            "post",
        )
        self._ensure_module_command(
            "guilds",
            "update_guild_build",
            "/v1/guilds/{guild_id}/builds/{build_id}",
            "patch",
        )
        self._ensure_module_command(
            "guilds",
            "delete_guild_build",
            "/v1/guilds/{guild_id}/builds/{build_id}",
            "delete",
        )
        self._ensure_module_command(
            "guilds",
            "get_guild_build_install_manifest",
            "/v1/guilds/{guild_id}/builds/{build_id}/manifest",
            "get",
        )
        self._ensure_module_command(
            "guilds",
            "refresh_guild_build_install_manifest",
            "/v1/guilds/{guild_id}/builds/{build_id}/manifest/refresh",
            "post",
        )
        self._ensure_module_command(
            "guilds",
            "backfill_install_manifests_for_existing_published_builds",
            "/v1/guilds/{guild_id}/builds/manifest/backfill",
            "post",
        )
        self._ensure_module_command(
            "guilds",
            "upload_or_set_build_icon",
            "/v1/guilds/{guild_id}/builds/{build_id}/icon",
            "post",
        )
        self._ensure_module_command(
            "guilds",
            "upload_or_set_build_cover_image",
            "/v1/guilds/{guild_id}/builds/{build_id}/cover",
            "post",
        )
        # Legacy launcher aliases (same paths as live operation ids above).
        self._ensure_module_command(
            "guilds",
            "upload_guild_build_icon",
            "/v1/guilds/{guild_id}/builds/{build_id}/icon",
            "post",
        )
        self._ensure_module_command(
            "guilds",
            "upload_guild_build_cover",
            "/v1/guilds/{guild_id}/builds/{build_id}/cover",
            "post",
        )
        # Guild branding media (same body shape as build icon/cover uploads).
        self._ensure_module_command(
            "guilds",
            "upload_guild_icon",
            "/v1/guilds/{guild_id}/icon",
            "post",
        )
        self._ensure_module_command(
            "guilds",
            "upload_guild_banner",
            "/v1/guilds/{guild_id}/banner",
            "post",
        )
        # Guild server media (same body shape as build icon/cover uploads).
        self._ensure_module_command(
            "guilds",
            "upload_or_set_server_icon",
            "/v1/guilds/{guild_id}/servers/{server_id}/icon",
            "post",
        )
        self._ensure_module_command(
            "guilds",
            "upload_or_set_server_cover_image",
            "/v1/guilds/{guild_id}/servers/{server_id}/cover",
            "post",
        )
        # Manifest has members.kick in docs but no operation id yet.
        self._ensure_module_command(
            "guilds",
            "kick_guild_member",
            "/v1/guilds/{guild_id}/members/{target_user_id}",
            "delete",
        )
        # CultAgent control-plane (api host) + guild-scoped listing.
        self._ensure_api_command("list_my_cultagent_nodes", "/v1/agents", "get")
        self._ensure_api_command(
            "create_a_short-lived_pairing_code_for_cf-agent_claim",
            "/v1/agents/pairing",
            "post",
        )
        self._ensure_api_command(
            "start_gh-style_device_login_(cf-agent_login)",
            "/v1/agents/device/start",
            "post",
        )
        self._ensure_api_command(
            "poll_device_login_until_approved_(returns_agent_token_once)",
            "/v1/agents/device/token",
            "post",
        )
        self._ensure_api_command(
            "approve_a_pending_device_login_(browser_/_launcher)",
            "/v1/agents/device/approve",
            "post",
        )
        self._ensure_api_command(
            "get_cultagent_node",
            "/v1/agents/{node_id}",
            "get",
        )
        self._ensure_api_command(
            "list_workloads_on_a_node",
            "/v1/agents/{node_id}/workloads",
            "get",
        )
        self._ensure_api_command(
            "get_cultagent_node_telemetry",
            "/v1/agents/{node_id}/telemetry",
            "get",
        )
        self._ensure_api_command(
            "enqueue_a_command_for_the_agent_to_poll",
            "/v1/agents/{node_id}/commands",
            "post",
        )
        self._ensure_api_command(
            "enqueue_command_for_a_node",
            "/v1/agents/{node_id}/commands",
            "post",
        )
        self._ensure_api_command(
            "list_commands_for_a_node",
            "/v1/agents/{node_id}/commands",
            "get",
        )
        self._ensure_api_command(
            "get_command_for_a_node",
            "/v1/agents/{node_id}/commands/{command_id}",
            "get",
        )
        self._ensure_api_command(
            "get_workload_console_snapshot",
            "/v1/agents/{node_id}/workloads/{workload_id}/console",
            "get",
        )
        self._ensure_api_command(
            "confirm_a_high-risk_command_(e.g._backup.restore)",
            "/v1/agents/{node_id}/commands/{command_id}/confirm",
            "post",
        )
        self._ensure_api_command(
            "attach_a_workload_to_a_node",
            "/v1/agents/{node_id}/workloads",
            "post",
        )
        self._ensure_api_command(
            "revoke_agent_credentials",
            "/v1/agents/{node_id}/revoke",
            "post",
        )
        self._ensure_api_command(
            "rotate_agent_token_(returns_new_token_once)",
            "/v1/agents/{node_id}/rotate-token",
            "post",
        )
        self._ensure_module_command(
            "api",
            "list_cultagent_nodes_for_a_guild",
            "/v1/guilds/{guild_id}/agents",
            "get",
        )
        self._ensure_module_command(
            "api",
            "attach_an_agent_node_to_a_guild_(guildmaster_/_agent.manage)",
            "/v1/guilds/{guild_id}/agents/{node_id}/attach",
            "post",
        )
        self._ensure_module_command(
            "api",
            "detach_an_agent_node_from_a_guild",
            "/v1/guilds/{guild_id}/agents/{node_id}/detach",
            "post",
        )
        # Guild JWT reads for agent runtime / presence / events + CLI profiles.
        self._ensure_module_command(
            "api",
            "list_agent_runtime_snapshots_for_a_guild",
            "/v1/guilds/{guild_id}/agents/runtime",
            "get",
        )
        self._ensure_module_command(
            "api",
            "list_live_agent_player_presence_for_a_guild",
            "/v1/guilds/{guild_id}/agents/players",
            "get",
        )
        self._ensure_module_command(
            "api",
            "list_recent_agent_gameplay_events_for_a_guild",
            "/v1/guilds/{guild_id}/agents/events",
            "get",
        )
        self._ensure_module_command(
            "api",
            "get_guild_default_agent_command_profile",
            "/v1/guilds/{guild_id}/agent-commands",
            "get",
        )
        self._ensure_module_command(
            "api",
            "put_guild_default_agent_command_profile",
            "/v1/guilds/{guild_id}/agent-commands",
            "put",
        )
        self._ensure_api_command(
            "get_node_override_command_profile",
            "/v1/agents/{node_id}/commands/profile",
            "get",
        )
        self._ensure_api_command(
            "put_node_override_command_profile",
            "/v1/agents/{node_id}/commands/profile",
            "put",
        )
        # Public build catalog.
        self._ensure_api_command(
            "search_public_build_catalog",
            "/v1/builds/discover",
            "get",
        )
        self._ensure_api_command(
            "get_public_catalog_build_detail",
            "/v1/builds/{build_id}",
            "get",
        )
        # User builds (personal build configs).
        self._ensure_api_command("list_my_builds", "/v1/me/builds", "get")
        self._ensure_api_command("create_user_build", "/v1/me/builds", "post")
        self._ensure_api_command(
            "get_my_build", "/v1/me/builds/{build_id}", "get"
        )
        self._ensure_api_command(
            "update_my_build", "/v1/me/builds/{build_id}", "patch"
        )
        self._ensure_api_command(
            "delete_my_build", "/v1/me/builds/{build_id}", "delete"
        )
        # Personal servers.
        self._ensure_api_command(
            "list_my_personal_servers", "/v1/me/servers", "get"
        )
        self._ensure_api_command(
            "create_personal_server", "/v1/me/servers", "post"
        )
        self._ensure_api_command(
            "get_personal_server", "/v1/me/servers/{server_id}", "get"
        )
        self._ensure_api_command(
            "update_personal_server", "/v1/me/servers/{server_id}", "patch"
        )
        self._ensure_api_command(
            "delete_personal_server", "/v1/me/servers/{server_id}", "delete"
        )
        # Agent server bindings.
        self._ensure_api_command(
            "list_agent_server_bindings",
            "/v1/agents/{node_id}/bindings",
            "get",
        )
        self._ensure_module_command(
            "api",
            "bind_guild_server_to_agent",
            "/v1/guilds/{guild_id}/servers/{server_id}/agents/{node_id}/bind",
            "post",
        )
        self._ensure_module_command(
            "api",
            "unbind_guild_server_from_agent",
            "/v1/guilds/{guild_id}/servers/{server_id}/agents/{node_id}/bind",
            "delete",
        )
        self._ensure_api_command(
            "bind_personal_server_to_agent",
            "/v1/me/servers/{server_id}/agents/{node_id}/bind",
            "post",
        )
        self._ensure_api_command(
            "unbind_personal_server_from_agent",
            "/v1/me/servers/{server_id}/agents/{node_id}/bind",
            "delete",
        )

    def _override_api_path(self, command_id: str, new_path: str) -> None:
        api_skel = self.__skel.get("api")
        if not isinstance(api_skel, dict) or command_id not in api_skel:
            return
        old_path = api_skel[command_id]
        if old_path == new_path:
            return
        api_schema = self.schema.get("api")
        if isinstance(api_schema, dict) and old_path in api_schema:
            api_schema[new_path] = api_schema[old_path]
        api_skel[command_id] = new_path

    def _ensure_module_command(
        self,
        module: str,
        command_id: str,
        path: str,
        method: str = "get",
    ) -> None:
        """Inject a command into skel/schema when remote manifest omits it."""
        if module not in self.__skel:
            self.__skel[module] = {}
        mod_skel = self.__skel[module]
        if module not in self.schema:
            self.schema[module] = {}
        mod_schema = self.schema[module]

        def _ensure_method() -> None:
            if path not in mod_schema:
                parameters = [
                    {
                        "name": name,
                        "in": "path",
                        "required": True,
                        "schema": {"type": "string"},
                    }
                    for name in re.findall(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}", path)
                ]
                mod_schema[path] = {
                    "uri": path,
                    "methods": {
                        method: {
                            "description": None,
                            "parameters": parameters or None,
                            "responses": {
                                "200": {
                                    "description": "Successful Response",
                                    "content": {
                                        "application/json": {"schema": {}}
                                    },
                                }
                            },
                            "id": command_id,
                        }
                    },
                }
                return
            methods = dict(mod_schema[path].get("methods") or {})
            existing = methods.get(method) or {}
            if str(existing.get("id") or "") == command_id:
                return
            if method in methods and str(existing.get("id") or ""):
                # Path already has this HTTP verb under another operation id —
                # still register our command id against the same path/method.
                pass
            parameters = [
                {
                    "name": name,
                    "in": "path",
                    "required": True,
                    "schema": {"type": "string"},
                }
                for name in re.findall(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}", path)
            ]
            # Prefer attaching under the requested verb; if verb taken by another
            # id, keep that verb and rely on id-matching in dispatch.
            if method not in methods or not str(existing.get("id") or ""):
                methods[method] = {
                    "description": None,
                    "parameters": parameters or None,
                    "responses": {
                        "200": {
                            "description": "Successful Response",
                            "content": {
                                "application/json": {"schema": {}}
                            },
                        }
                    },
                    "id": command_id,
                }
                mod_schema[path]["methods"] = methods
            else:
                # Duplicate verb: store a synthetic methods key won't work.
                # Overwrite id only when the existing id is empty/none.
                if not str(existing.get("id") or "").strip():
                    methods[method] = {**existing, "id": command_id}
                    mod_schema[path]["methods"] = methods

        _ensure_method()
        mod_skel[command_id] = path

        # If the path already exposed this verb under a different operation id,
        # dispatch won't find our id on that method. Add a dedicated alias
        # method entry keyed by an internal name so id matching still works.
        endpoint = mod_schema.get(path) or {}
        methods = dict(endpoint.get("methods") or {})
        matched = any(
            str((details or {}).get("id") or "") == command_id
            for details in methods.values()
        )
        if not matched:
            alias = f"{method}__{command_id}"
            parameters = [
                {
                    "name": name,
                    "in": "path",
                    "required": True,
                    "schema": {"type": "string"},
                }
                for name in re.findall(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}", path)
            ]
            methods[alias] = {
                "description": None,
                "parameters": parameters or None,
                "responses": {
                    "200": {
                        "description": "Successful Response",
                        "content": {"application/json": {"schema": {}}},
                    }
                },
                "id": command_id,
                # Real HTTP verb for _request (alias keys are ignored as verbs).
                "http_method": method,
            }
            mod_schema[path]["methods"] = methods

    def _ensure_api_command(
        self, command_id: str, path: str, method: str = "get"
    ) -> None:
        self._ensure_module_command("api", command_id, path, method)

    @classmethod
    async def create(
        cls,
        base_url: str | None = None,
        http: httpx.AsyncClient | None = None,
    ) -> "Client":
        """Factory method to handle the async download before instantiation"""
        owns_client = http is None
        client = http or httpx.AsyncClient(timeout=httpx.Timeout(10.0))
        resolved = (base_url or "").strip() or manifest_url()
        try:
            response = await client.get(resolved)
            if response.status_code != 200:
                raise RemoteUnavailable(
                    f"Cannot connect to `{resolved}` to fetch schema"
                )
            schema_data = response.json()
            return cls(schema_data, http=http)
        finally:
            if owns_client:
                await client.aclose()

    def setup_register_token(self, rToken: str) -> None:
        self.rToken = rToken

    def get_register_token(self) -> str | None:
        if self.rToken is None:
            raise RuntimeError("No Register Token found")
        return self.rToken

    def setup_session_token(
        self,
        token: str,
        *,
        user_agent: str | None = None,
        platform: str | None = None,
        retain_fingerprint: bool = False,
    ) -> None:
        self.sessionToken = token
        # Replay browser fingerprint headers so api.cultforge.com session
        # digest matches the OAuth-issued keyhash (platform|country|ua).
        if retain_fingerprint:
            if user_agent is not None:
                self._session_user_agent = user_agent or None
            if platform is not None:
                self._session_platform = platform or None
        else:
            self._session_user_agent = user_agent
            self._session_platform = platform

    def get_session_token(self) -> str | None:
        return self.sessionToken

    def get_session_fingerprint(self) -> dict[str, str | None]:
        return {
            "user_agent": getattr(self, "_session_user_agent", None),
            "platform": getattr(self, "_session_platform", None),
        }

    def clear_session_token(self) -> None:
        self.sessionToken = None
        self._session_user_agent = None
        self._session_platform = None

    def apply_oauth_token(
        self,
        token: str,
        message: str | None = None,
        *,
        user_agent: str | None = None,
        platform: str | None = None,
    ) -> str:
        """
        Route an OAuth callback token to register vs session storage.
        Returns 'register' | 'session' | 'unknown'.
        """
        scope = jwt_scope(token) or ""
        msg = (message or "").lower()
        if "registration" in scope or "register" in scope:
            self.setup_register_token(token)
            return "register"
        if "app_session" in scope or "session" in scope:
            self.setup_session_token(
                token, user_agent=user_agent, platform=platform
            )
            return "session"
        # Fallback heuristics from callback message.
        if "register" in msg or "signup" in msg or "verified" in msg:
            self.setup_register_token(token)
            return "register"
        if token:
            # Prefer session for returning users when scope is ambiguous.
            self.setup_session_token(
                token, user_agent=user_agent, platform=platform
            )
            return "session"
        return "unknown"

    def _merge_auth_headers(self, headers: Optional[Dict[str, str]]) -> Dict[str, str]:
        """Inject Bearer sKEY for all outbound requests when sessionToken is set.

        set_session_key / load_keys_from_keyring must call setup_session_token so
        schema.json ``auth: session`` commands receive Authorization automatically.
        """
        merged = dict(headers or {})
        if self.sessionToken and "Authorization" not in merged:
            merged["Authorization"] = f"Bearer {self.sessionToken}"
        # Match OAuth-issued session fingerprint (see generate_session_digest).
        # Always overwrite — shared AsyncClient defaults to python-httpx/* UA,
        # which breaks digest checks against the browser-bound session.
        ua = getattr(self, "_session_user_agent", None)
        platform = getattr(self, "_session_platform", None)
        if ua:
            merged.pop("user-agent", None)
            merged["User-Agent"] = ua
        if platform:
            merged["sec-ch-ua-platform"] = platform
        return merged

    async def _request(
        self,
        method: str,
        url: str,
        **kwargs: Any,
    ) -> httpx.Response:
        headers = kwargs.pop("headers", None)
        kwargs["headers"] = self._merge_auth_headers(
            headers if isinstance(headers, dict) else None
        )
        if self._http is not None:
            return await self._http.request(method, url, **kwargs)
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
            return await client.request(method, url, **kwargs)

    async def create_account(self, data: SignupRequest) -> Dict:
        """Create A/C"""
        try:
            remote = UserCreateRequest(
                username=data.username,
                handle_name=data.handle_name,
                password=data.password,
                avatar_url=data.avatar_url or None,
            )
            dataX = remote.model_dump(exclude_none=False)
            try:
                token = self.get_register_token()
            except RuntimeError as e:
                return StandardResponse(
                    status=False,
                    message="Invalid Request",
                    data={
                        "reason": "The request cannot be completed because the OAuth was not started",
                        "debug": str(e),
                    },
                    code=400,
                ).model_dump()
            headers = {"Authorization": f"Bearer {token}"}
            response = await self._request(
                "POST",
                f"{module_base('auth')}/v1/create_account",
                json=dataX,
                headers=headers,
            )
            if response.status_code == 409:
                return StandardResponse(
                    status=False,
                    message="There is already an active CultForge account tethered to this provider.",
                    data={
                        "reason": "There is already an a/c linked",
                        "debug": None,
                        "page": response.text,
                    },
                    code=response.status_code,
                ).model_dump()
            elif response.status_code == 226:
                return StandardResponse(
                    status=False,
                    message="This username has already been taken",
                    code=response.status_code,
                ).model_dump()
            elif response.status_code == 200:
                try:
                    body = response.json()
                except Exception:
                    body = {}
                session = extract_session_token(body)
                if session:
                    self.setup_session_token(session)
                return StandardResponse(
                    status=True,
                    message="Account Forged !",
                    data={"payload": body, "token": session},
                    code=response.status_code,
                ).model_dump()
            elif response.status_code == 401 or response.status_code == 403:
                return StandardResponse(
                    status=False,
                    message="Unauthorized",
                    data={
                        "reason": "You dont have access for this operation",
                        "debug": None,
                        "page": response.text,
                    },
                    code=response.status_code,
                ).model_dump()
            else:
                return StandardResponse(
                    status=False,
                    message="Something happend !",
                    data={
                        "reason": "An Unknown error has occured, if this repeates please contact `support@cultforge.com`",
                        "debug": None,
                        "page": response.text,
                    },
                    code=response.status_code,
                ).model_dump()
        except Exception as e:
            return StandardResponse(
                status=None,
                message="Something happend !",
                data={"reason": "Internal Client Error Maybe", "debug": str(e)},
                code=500,
            ).model_dump()

    async def update_handle(self, new_handle_name: str) -> Dict:
        try:
            body = UserHandleUpdateRequest(
                new_handle_name=new_handle_name
            ).model_dump()
            response = await self._request(
                "POST",
                f"{module_base('auth')}/v1/profile/update-handle",
                json=body,
            )
            try:
                data = response.json()
            except Exception:
                data = {"text": response.text}
            if response.status_code == 200:
                return StandardResponse(
                    status=True,
                    message=str(data.get("message") or "Handle updated"),
                    data=data.get("data") if isinstance(data, dict) else data,
                    code=200,
                ).model_dump()
            return StandardResponse(
                status=False,
                message=str(
                    (data.get("detail") if isinstance(data, dict) else None)
                    or (data.get("message") if isinstance(data, dict) else None)
                    or "Could not update handle"
                ),
                data=data if isinstance(data, dict) else {"page": response.text},
                code=response.status_code,
            ).model_dump()
        except Exception as e:
            return StandardResponse(
                status=None,
                message="Something happend !",
                data={"reason": "Internal Client Error Maybe", "debug": str(e)},
                code=500,
            ).model_dump()

    async def update_avatar(
        self,
        avatar_url: Optional[str] = None,
        *,
        avatar_base64: Optional[str] = None,
        content_type: Optional[str] = None,
    ) -> Dict:
        """Set profile picture via base64 upload, external URL, or clear."""
        try:
            url = (avatar_url or "").strip() or None
            b64 = (avatar_base64 or "").strip() or None
            ct = (content_type or "").strip() or None
            # Strip data-URL prefix if the UI sent one; remote wants raw base64.
            if b64 and b64.lower().startswith("data:"):
                comma = b64.find(",")
                if comma >= 0:
                    header = b64[:comma]
                    b64 = b64[comma + 1 :].strip()
                    if not ct and ";base64" in header.lower():
                        mime = header[5:].split(";")[0].strip().lower()
                        if mime:
                            ct = mime
            if b64:
                body: Dict[str, Any] = {
                    "avatar_base64": b64,
                    "content_type": ct or "image/png",
                }
            elif url:
                body = {"avatar_url": url}
            else:
                body = {"avatar_url": None}
            response = await self._request(
                "POST",
                f"{module_base('api')}/v1/profile/avatar",
                json=body,
            )
            try:
                data = response.json()
            except Exception:
                data = {"text": response.text}
            if response.status_code == 200:
                if b64:
                    default_msg = "Profile picture uploaded."
                elif url:
                    default_msg = "Profile picture updated."
                else:
                    default_msg = "Profile picture cleared."
                return StandardResponse(
                    status=True,
                    message=str(data.get("message") or default_msg),
                    data=data.get("data") if isinstance(data, dict) else data,
                    code=200,
                ).model_dump()
            detail = None
            if isinstance(data, dict):
                detail = data.get("detail") or data.get("message")
                if isinstance(detail, list):
                    # FastAPI validation errors
                    parts = []
                    for item in detail:
                        if isinstance(item, dict) and item.get("msg"):
                            parts.append(str(item["msg"]))
                    detail = "; ".join(parts) if parts else str(detail)
            return StandardResponse(
                status=False,
                message=str(detail or "Could not update profile picture"),
                data=data if isinstance(data, dict) else {"page": response.text},
                code=response.status_code,
            ).model_dump()
        except Exception as e:
            return StandardResponse(
                status=None,
                message="Something happend !",
                data={"reason": "Internal Client Error Maybe", "debug": str(e)},
                code=500,
            ).model_dump()

    async def logout(self) -> Dict:
        try:
            response = await self._request(
                "POST",
                f"{module_base('auth')}/v1/logout",
            )
            self.clear_session_token()
            self.rToken = None
            if response.status_code == 200:
                return StandardResponse(
                    status=True, message="Logout Successfull !", code=200
                ).model_dump()
            return StandardResponse(
                status=False,
                message="Something happend !",
                data={
                    "reason": "Something happend while logging you out !",
                    "debug": None,
                    "page": response.text,
                },
                code=response.status_code,
            ).model_dump()
        except Exception as e:
            self.clear_session_token()
            self.rToken = None
            return StandardResponse(
                status=None,
                message="Something happend !",
                data={"reason": "Internal Client Error Maybe", "debug": str(e)},
                code=500,
            ).model_dump()

    async def delete_account(
        self,
        *,
        confirm: bool = True,
        delete_owned_guilds: bool = False,
        password: str | None = None,
    ) -> Dict:
        """Soft-delete the signed-in account via DELETE /v1/account."""
        try:
            body = AccountDeleteRequest(
                confirm=confirm,
                delete_owned_guilds=delete_owned_guilds,
                password=password,
            ).model_dump(exclude_none=True)
            response = await self._request(
                "DELETE",
                f"{module_base('auth')}/v1/account",
                json=body,
            )
            try:
                data = response.json()
            except Exception:
                data = {"text": response.text}
            if response.status_code == 200:
                self.clear_session_token()
                self.rToken = None
                return StandardResponse(
                    status=True,
                    message=str(
                        (data.get("message") if isinstance(data, dict) else None)
                        or "Account deactivated successfully."
                    ),
                    data=data if isinstance(data, dict) else None,
                    code=200,
                ).model_dump()
            return StandardResponse(
                status=False,
                message=str(
                    (data.get("detail") if isinstance(data, dict) else None)
                    or (data.get("message") if isinstance(data, dict) else None)
                    or "Could not delete account"
                ),
                data=data if isinstance(data, dict) else {"page": response.text},
                code=response.status_code,
            ).model_dump()
        except Exception as e:
            return StandardResponse(
                status=None,
                message="Something happend !",
                data={"reason": "Internal Client Error Maybe", "debug": str(e)},
                code=500,
            ).model_dump()

    def __repr__(self) -> str:
        return f"<Client schema={hash(str(self.schema))}>"

    async def dispatch(
        self,
        module: str,
        command: str,
        **kwargs,
    ) -> Any:
        """
        Validates the module/command, inspects the schema to determine
         the correct HTTP method and parameter structure, and executes the request.
        """
        if module not in self.skel:
            raise ValueError(f"Module {module} not found in schema")
        if command not in self.skel[module]:
            raise ValueError(f"Command {command} not found in module {module}")

        target_path = self.skel[module][command]
        endpoint_meta = self.schema[module][target_path]

        # Prefer the HTTP method whose OpenAPI id matches `command`
        # (same path can expose GET + PATCH/DELETE with different ids).
        method_type = None
        method_meta = None
        for mname, details in (endpoint_meta.get("methods") or {}).items():
            mid = str(details.get("id") or "none")
            if mid == command:
                method_type = mname
                method_meta = details
                break
        if method_type is None:
            method_type = list(endpoint_meta["methods"].keys())[0]
            method_meta = endpoint_meta["methods"][method_type]

        # Injected aliases may use keys like "post__upload_guild_icon".
        http_verb = str(
            (method_meta or {}).get("http_method") or method_type or "get"
        ).split("__", 1)[0]

        schema_params = method_meta.get("parameters") or []
        path_param_names = {
            p["name"] for p in schema_params if p.get("in") == "path"
        }
        # Also treat `{name}` placeholders as path params when OpenAPI omits them.
        for match in re.findall(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}", target_path):
            path_param_names.add(match)

        query_param_names = {
            p["name"] for p in schema_params if p.get("in") == "query"
        }

        params = {}
        json_data = {}
        path_values: Dict[str, Any] = {}

        for key, value in kwargs.items():
            if key in path_param_names:
                path_values[key] = value
            elif key in query_param_names:
                params[key] = value
            else:
                json_data[key] = value

        resolved_path = target_path
        for key, value in path_values.items():
            resolved_path = resolved_path.replace(
                "{" + key + "}",
                str(value),
            )
        if "{" in resolved_path and "}" in resolved_path:
            missing = re.findall(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}", resolved_path)
            raise ValueError(
                f"Missing path parameter(s) for {module}/{command}: {', '.join(missing)}"
            )

        url = f"{module_base(module)}{resolved_path}"

        response = await self._request(
            http_verb.upper(),
            url,
            params=params if params else None,
            json=json_data
            if json_data and http_verb.lower() in ("post", "put", "patch")
            else None,
        )
        if response.is_redirect:
            # OAuth (and similar) use 302/307 on purpose — not an error.
            return {
                "redirect": True,
                "status": response.status_code,
                "url": response.headers.get("Location") or str(response.url),
                "location": response.headers.get("Location"),
            }
        try:
            body = response.json()
        except Exception as e:
            return {
                "e": str(e),
                "text": response.text,
                "code": response.status_code,
                "message": "Invalid JSON from remote",
            }

        if not response.is_success:
            if isinstance(body, dict):
                out = dict(body)
                out.setdefault("code", response.status_code)
                if "message" not in out and "detail" in out:
                    out["message"] = str(out["detail"])
                return out
            return {
                "code": response.status_code,
                "message": str(body) if body is not None else response.text,
            }

        if isinstance(body, dict) and "code" not in body:
            # Keep successful bodies clean; sidecar defaults HTTP 200.
            return body
        return body

    @property
    def skel(self) -> Dict:
        return self.__skel


@deprecated("Use `Client` instead")
class _Client(Client):
    """Deprecated alias kept for older imports."""

    pass


__all__ = ["Client", "_Client", "ClientError", "RemoteUnavailable"]
