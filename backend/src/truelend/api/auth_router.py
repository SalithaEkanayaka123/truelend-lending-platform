"""Public login and the authenticated `/me` session endpoint."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from truelend.api.deps import get_app_settings, get_clock, get_conn, get_current_principal
from truelend.config.settings import Settings
from truelend.repository.users_repo import display_names
from truelend.service.auth_service import InvalidCredentialsError, login
from truelend.types.contracts import AuthPrincipal, Clock
from truelend.types.enums import Role

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    role: Role
    display_name: str | None


class MeResponse(BaseModel):
    user_id: int
    email: str
    role: Role
    display_name: str | None


@router.post("/login", response_model=LoginResponse)
def login_route(
    body: LoginRequest,
    conn: sqlite3.Connection = Depends(get_conn),
    settings: Settings = Depends(get_app_settings),
    clock: Clock = Depends(get_clock),
) -> LoginResponse:
    try:
        issued = login(conn, settings, clock, body.email, body.password)
    except InvalidCredentialsError as exc:
        raise HTTPException(status_code=401, detail="Invalid email or password.") from exc
    return LoginResponse(
        access_token=issued.access_token,
        token_type=issued.token_type,
        expires_in=issued.expires_in,
        role=issued.role,
        display_name=issued.display_name,
    )


@router.get("/me", response_model=MeResponse)
def me_route(
    principal: AuthPrincipal = Depends(get_current_principal),
    conn: sqlite3.Connection = Depends(get_conn),
) -> MeResponse:
    name = display_names(conn, {principal.user_id}).get(principal.user_id)
    return MeResponse(
        user_id=principal.user_id, email=principal.email, role=principal.role, display_name=name
    )
