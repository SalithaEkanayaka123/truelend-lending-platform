"""Incident 11 regression: concurrent authenticated requests must all succeed.

`get_conn` used to open a SQLite connection on one threadpool thread while
`get_current_principal` used it on another, so requests arriving together
failed with `sqlite3.ProgrammingError` (500 INTERNAL_ERROR). Requests that
arrive one at a time reuse a single worker thread and hide the bug, so this
test fires them from a thread pool against the real app.
"""

from __future__ import annotations

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from truelend.api.main import create_app
from truelend.config.db import DEMO_PASSWORD
from truelend.config.settings import Settings

_BACKEND = Path(__file__).resolve().parents[2]
_REQUESTS = 64
_WORKERS = 8
_PATHS = ("/api/products", "/api/policies")


@pytest.fixture
def real_client(tmp_path: Path) -> Iterator[TestClient]:
    policies_dir = tmp_path / "policies"
    policies_dir.mkdir()
    seed = (_BACKEND / "policies" / "policy_v0001.json").read_text(encoding="utf-8")
    (policies_dir / "policy_v0001.json").write_text(seed, encoding="utf-8")
    settings = Settings(
        db_path=tmp_path / "concurrent.db",
        migrations_dir=_BACKEND / "migrations",
        policies_dir=policies_dir,
    )
    with TestClient(create_app(settings), raise_server_exceptions=False) as client:
        yield client


def _admin_headers(client: TestClient) -> dict[str, str]:
    r = client.post(
        "/api/auth/login", json={"email": "admin@example.test", "password": DEMO_PASSWORD}
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_concurrent_authenticated_requests_all_succeed(real_client: TestClient) -> None:
    headers = _admin_headers(real_client)

    def call(i: int) -> tuple[str, int, str]:
        path = _PATHS[i % len(_PATHS)]
        response = real_client.get(path, headers=headers)
        return path, response.status_code, response.headers.get("x-correlation-id", "-")

    with ThreadPoolExecutor(max_workers=_WORKERS) as pool:
        results = list(pool.map(call, range(_REQUESTS)))

    failures = [r for r in results if r[1] != 200]
    assert failures == [], f"{len(failures)} of {_REQUESTS} non-200: {failures[:5]}"
