"""E1-S4-AC2/AC3: checksummed, idempotent migrations (VM-016, VM-017)."""

from __future__ import annotations

import sqlite3
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from truelend.api.main import create_app
from truelend.config.db import run_migrations, seed_users
from truelend.config.settings import Settings
from truelend.types.errors import MigrationChecksumMismatchError

SELECT = "SELECT filename, sha256, applied_at FROM schema_migrations"


def make_dir(tmp_path: Path) -> Path:
    d = tmp_path / "mig"
    d.mkdir()
    for n, name in ((1, "a"), (2, "b"), (3, "c")):
        (d / f"000{n}_{name}.sql").write_text(f"CREATE TABLE {name} (id INTEGER PRIMARY KEY);")
    return d


def test_e1_s4_ac2_rerun_applies_nothing_and_keeps_three_checksummed_rows(tmp_path: Path) -> None:
    d = make_dir(tmp_path)
    conn = sqlite3.connect(tmp_path / "x.db")
    run_migrations(conn, d)
    first = conn.execute(SELECT).fetchall()
    run_migrations(conn, d)
    second = conn.execute(SELECT).fetchall()
    assert len(second) == 3 and first == second
    assert all(len(r[1]) == 64 for r in second)


def test_e1_s4_ac3_edited_applied_migration_aborts(tmp_path: Path) -> None:
    d = make_dir(tmp_path)
    conn = sqlite3.connect(tmp_path / "x.db")
    run_migrations(conn, d)
    (d / "0002_b.sql").write_text("CREATE TABLE b (id INTEGER PRIMARY KEY, extra TEXT);")
    with pytest.raises(MigrationChecksumMismatchError) as exc:
        run_migrations(conn, d)
    assert exc.value.code == "MIGRATION_CHECKSUM_MISMATCH"


def test_e1_s4_missing_applied_migration_aborts(tmp_path: Path) -> None:
    d = make_dir(tmp_path)
    conn = sqlite3.connect(tmp_path / "x.db")
    run_migrations(conn, d)
    (d / "0003_c.sql").unlink()
    with pytest.raises(MigrationChecksumMismatchError):
        run_migrations(conn, d)


def test_e1_s4_ac3_startup_aborts_and_health_never_200(
    make_settings: Callable[[str | None], Settings], tmp_path: Path
) -> None:
    base = make_settings("test")
    mig = tmp_path / "mig"
    mig.mkdir()
    target = mig / "0001_users_and_audit.sql"
    target.write_text(
        (base.migrations_dir / "0001_users_and_audit.sql").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    for name in ("0002_policy_versions.sql", "0006_user_display_name.sql"):
        (mig / name).write_text(
            (base.migrations_dir / name).read_text(encoding="utf-8"), encoding="utf-8"
        )
    settings = replace(base, migrations_dir=mig)
    with TestClient(create_app(settings)) as ok:
        assert ok.get("/health").status_code == 200
    target.write_text("-- tampered\n", encoding="utf-8")
    with pytest.raises(MigrationChecksumMismatchError):
        with TestClient(create_app(settings)) as c:
            c.get("/health")


def test_e1_s4_users_audit_schema_seed_and_append_only(
    make_settings: Callable[[str | None], Settings],
) -> None:
    settings = make_settings("test")
    conn = sqlite3.connect(settings.db_path)
    run_migrations(conn, settings.migrations_dir)
    seed_users(conn)
    seed_users(conn)
    rows = conn.execute("SELECT id, email, role FROM users ORDER BY id").fetchall()
    assert rows == [
        (1, "admin@example.test", "ADMIN"),
        (2, "policy@example.test", "POLICY_EDITOR"),
        (3, "underwriter@example.test", "UNDERWRITER"),
        (4, "customer1@example.test", "CUSTOMER"),
        (5, "customer2@example.test", "CUSTOMER"),
    ]
    pw = conn.execute("SELECT password_hash FROM users WHERE id = 4").fetchone()[0]
    assert pw.startswith("scrypt$")
    conn.execute(
        "INSERT INTO audit_log (occurred_at, actor_user_id, actor_role, action, entity_type,"
        " entity_id, correlation_id) VALUES ('2026-01-01T00:00:00Z', 3, 'UNDERWRITER', 'X',"
        " 'application', 7, 'cid-12345678')"
    )
    with pytest.raises(sqlite3.DatabaseError):
        conn.execute("UPDATE audit_log SET action = 'Y'")
    with pytest.raises(sqlite3.DatabaseError):
        conn.execute("DELETE FROM audit_log")
    assert conn.execute("SELECT action FROM audit_log").fetchone() == ("X",)


_DISPLAY_NAMES = {
    "admin@example.test": "Arjun Mehta",
    "policy@example.test": "Meera Iyer",
    "underwriter@example.test": "Rahul Varma",
    "customer1@example.test": "Priya Nair",
    "customer2@example.test": "Karan Shah",
}


def test_migration_0006_adds_display_name_and_seeds_demo_names(
    make_settings: Callable[[str | None], Settings],
) -> None:
    settings = make_settings("test")
    conn = sqlite3.connect(settings.db_path)
    run_migrations(conn, settings.migrations_dir)
    seed_users(conn)
    seed_users(conn)
    rows = dict(conn.execute("SELECT email, display_name FROM users").fetchall())
    assert rows == _DISPLAY_NAMES


def test_migration_0006_backfills_users_that_existed_before_it(
    make_settings: Callable[[str | None], Settings], tmp_path: Path
) -> None:
    settings = make_settings("test")
    early = tmp_path / "early"
    early.mkdir()
    for f in sorted(settings.migrations_dir.glob("*.sql")):
        if f.name < "0006":
            (early / f.name).write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
    conn = sqlite3.connect(settings.db_path)
    run_migrations(conn, early)
    conn.execute(
        "INSERT INTO users (email, role, password_hash) VALUES ('customer1@example.test',"
        " 'CUSTOMER', 'x')"
    )
    conn.commit()
    run_migrations(conn, settings.migrations_dir)
    name = conn.execute("SELECT display_name FROM users").fetchone()[0]
    assert name == "Priya Nair"
