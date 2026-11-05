"""Shared fixtures: isolated settings, fake clock, app + client, log capture."""

from __future__ import annotations

import io
from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from truelend.config.logging import configure_logging

from truelend.api.main import create_app
from truelend.config.db import DEMO_PASSWORD
from truelend.config.settings import Settings

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations"


class FakeClock:
    """Controllable Clock for token-lifetime tests."""

    def __init__(self) -> None:
        self._now = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self._now

    def advance(self, seconds: int) -> None:
        self._now += timedelta(seconds=seconds)


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def make_settings(tmp_path: Path) -> Callable[[str | None], Settings]:
    def _make(env: str | None = "test") -> Settings:
        return Settings(
            jwt_secret="unit-test-secret-not-for-production",
            db_path=tmp_path / "test.db",
            migrations_dir=MIGRATIONS_DIR,
            env=env,
        )

    return _make


@pytest.fixture
def log_buffer() -> io.StringIO:
    return io.StringIO()


@pytest.fixture
def client(
    make_settings: Callable[[str | None], Settings], clock: FakeClock, log_buffer: io.StringIO
) -> Iterator[TestClient]:
    app = create_app(make_settings("test"), clock=clock)
    configure_logging(stream=log_buffer)
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def login(client: TestClient) -> Callable[[str], dict[str, str]]:
    def _login(email: str) -> dict[str, str]:
        r = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    return _login
