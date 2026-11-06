"""SQLite connection, checksummed migrations, and synthetic-user seeding.

`hash_password`/`verify_password` live here (not in a `service` module)
because `config` may not import `service`, and this is the seeding/auth
password primitive shared by the seed data and by `service.auth_service`.
"""

from __future__ import annotations

import hashlib
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from truelend.config.settings import Settings
from truelend.types.enums import Role
from truelend.types.errors import MigrationChecksumMismatchError

# Synthetic demo password shared by all seeded users. Not a real secret.
DEMO_PASSWORD = "Synthetic-Dev-Pass-1!"

_SEED_USERS: tuple[tuple[str, Role, str], ...] = (
    ("admin@example.test", "ADMIN", "Arjun Mehta"),
    ("policy@example.test", "POLICY_EDITOR", "Meera Iyer"),
    ("underwriter@example.test", "UNDERWRITER", "Rahul Varma"),
    ("customer1@example.test", "CUSTOMER", "Priya Nair"),
    ("customer2@example.test", "CUSTOMER", "Karan Shah"),
)

_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${derived.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, hash_hex = stored.split("$")
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    salt = bytes.fromhex(salt_hex)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=int(n), r=int(r), p=int(p))
    return derived.hex() == hash_hex


def get_connection(settings: Settings, *, check_same_thread: bool = True) -> sqlite3.Connection:
    """`check_same_thread=False` is for a connection owned by exactly one
    request, which uses it strictly sequentially (see `api.deps.get_conn`)."""
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.db_path, check_same_thread=check_same_thread)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _ensure_schema_migrations_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        "filename TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)"
    )
    conn.commit()


def _apply_migration(conn: sqlite3.Connection, file: Path) -> None:
    content = file.read_text(encoding="utf-8")
    checksum = _sha256(content)
    conn.executescript(content)
    conn.execute(
        "INSERT INTO schema_migrations (filename, sha256, applied_at) VALUES (?, ?, ?)",
        (file.name, checksum, datetime.now(UTC).isoformat()),
    )
    conn.commit()


def run_migrations(conn: sqlite3.Connection, migrations_dir: Path) -> None:
    """Apply new `*.sql` files in order; abort if any previously-applied
    migration's file was edited or removed since it was applied."""
    _ensure_schema_migrations_table(conn)
    applied = dict(conn.execute("SELECT filename, sha256 FROM schema_migrations").fetchall())
    files = sorted(migrations_dir.glob("*.sql"))
    by_name = {f.name: f for f in files}
    for filename, checksum in applied.items():
        file = by_name.get(filename)
        if file is None or _sha256(file.read_text(encoding="utf-8")) != checksum:
            raise MigrationChecksumMismatchError(filename)
    for file in files:
        if file.name not in applied:
            _apply_migration(conn, file)


def seed_users(conn: sqlite3.Connection) -> None:
    """Idempotent: safe to call on every startup."""
    password_hash = hash_password(DEMO_PASSWORD)
    for email, role, display_name in _SEED_USERS:
        conn.execute(
            "INSERT OR IGNORE INTO users (email, role, password_hash, display_name)"
            " VALUES (?, ?, ?, ?)",
            (email, role, password_hash, display_name),
        )
    conn.commit()
