"""E1-S1 boundary: auth guard lives in the API layer; lower layers never import it."""

from __future__ import annotations

from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / "src" / "truelend"


def test_e1_s1_lower_layers_do_not_reference_api() -> None:
    for layer in ("service", "repository", "config", "types"):
        for f in (SRC / layer).glob("*.py"):
            assert "truelend.api" not in f.read_text(encoding="utf-8"), f.name


def test_e1_s1_role_guard_declared_in_api_layer() -> None:
    deps = (SRC / "api" / "deps.py").read_text(encoding="utf-8")
    assert "def require_roles" in deps and "def get_current_principal" in deps


def test_e1_s1_auth_router_never_logs_credentials() -> None:
    router = (SRC / "api" / "auth_router.py").read_text(encoding="utf-8")
    assert "logging" not in router and "print(" not in router
