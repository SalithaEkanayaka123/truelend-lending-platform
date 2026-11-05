"""E1-S4-AC1: health probe (VM-015)."""

from __future__ import annotations

import time

from fastapi.testclient import TestClient


def test_e1_s4_ac1_health_is_public_ok_and_fast(client: TestClient) -> None:
    start = time.perf_counter()
    r = client.get("/health")
    elapsed = time.perf_counter() - start
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    assert elapsed <= 1.0
