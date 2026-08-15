import re
from typing import Dict, Optional

from pydantic import BaseModel, Field, model_validator

SHA256_REGEX = re.compile(r"^[a-fA-F0-9]{64}$")


class SignupRequest(BaseModel):
    """Local sidecar body from the launcher UI (includes email for UX fallbacks)."""

    username: str
    password: str
    email: str
    handle_name: str
    avatar_url: str


class UserCreateRequest(BaseModel):
    """Remote auth.cultforge.com `/v1/create_account` body (ServerExpectsUserCreateRequest)."""

    username: str
    handle_name: str
    password: str
    avatar_url: Optional[str] = Field(default=None)

    @model_validator(mode="after")
    def validate_sha256_password(self) -> "UserCreateRequest":
        if not SHA256_REGEX.fullmatch(self.password):
            raise ValueError("Invalid length of password.")
        return self


class UserHandleUpdateRequest(BaseModel):
    """Remote auth.cultforge.com `/v1/profile/update-handle` body."""

    new_handle_name: str


class UserAvatarUpdateRequest(BaseModel):
    """Remote api.cultforge.com `POST /v1/profile/avatar` body.

    Provide exactly one of avatar_base64 (upload) or avatar_url (external),
    or neither to clear.
    """

    avatar_url: Optional[str] = Field(
        default=None,
        description="http(s) image URL; null/empty clears when no base64",
    )
    avatar_base64: Optional[str] = Field(
        default=None,
        description="Raw or data-URL base64 image payload (max 512 KiB decoded)",
    )
    content_type: Optional[str] = Field(
        default=None,
        description="Required with avatar_base64: image/png|jpeg|webp",
    )


class AccountDeleteRequest(BaseModel):
    """Remote auth.cultforge.com `DELETE /v1/account` body."""

    confirm: bool = False
    delete_owned_guilds: bool = False
    password: Optional[str] = None


class SignupResponse(BaseModel):
    status: bool
    message: str
    data: Optional[Dict] = None


class StandardResponse(BaseModel):
    status: bool | None
    message: str
    data: Optional[Dict] = None
    code: Optional[int] = None


class RequestPreset(BaseModel):
    token: Optional[str] = None
    user_agent: Optional[str] = None
