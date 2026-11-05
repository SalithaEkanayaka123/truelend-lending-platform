"""Application settings, loaded from `TRUELEND_*` environment variables.

A plain stdlib `dataclass` (not pydantic `BaseSettings`): callers construct
and override instances with `dataclasses.replace(...)` in tests, which
requires a real dataclass rather than a pydantic model.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parents[3]
_DEFAULT_DB_PATH = _BACKEND_ROOT / "data" / "truelend.db"
_DEFAULT_MIGRATIONS_DIR = _BACKEND_ROOT / "migrations"
_DEFAULT_JWT_SECRET = "dev-only-synthetic-secret-change-me"
_DEFAULT_JWT_ALGORITHM = "HS256"
_DEFAULT_JWT_EXPIRES_SECONDS = 1800


@dataclass(frozen=True)
class Settings:
    env: str | None = None
    db_path: Path = _DEFAULT_DB_PATH
    migrations_dir: Path = _DEFAULT_MIGRATIONS_DIR
    jwt_secret: str = _DEFAULT_JWT_SECRET
    jwt_algorithm: str = _DEFAULT_JWT_ALGORITHM
    jwt_expires_seconds: int = _DEFAULT_JWT_EXPIRES_SECONDS

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            env=os.environ.get("TRUELEND_ENV"),
            db_path=Path(os.environ.get("TRUELEND_DB_PATH", str(_DEFAULT_DB_PATH))),
            migrations_dir=Path(
                os.environ.get("TRUELEND_MIGRATIONS_DIR", str(_DEFAULT_MIGRATIONS_DIR))
            ),
            jwt_secret=os.environ.get("TRUELEND_JWT_SECRET", _DEFAULT_JWT_SECRET),
            jwt_algorithm=os.environ.get("TRUELEND_JWT_ALGORITHM", _DEFAULT_JWT_ALGORITHM),
            jwt_expires_seconds=int(
                os.environ.get("TRUELEND_JWT_EXPIRES_SECONDS", str(_DEFAULT_JWT_EXPIRES_SECONDS))
            ),
        )


def get_settings() -> Settings:
    return Settings.from_env()
