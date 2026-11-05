"""E1-S4-AC5: no float money (VM-019)."""

from __future__ import annotations

import ast
import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
SRC = BACKEND / "src" / "truelend"
REAL_RE = re.compile(r"\b(REAL|FLOAT|DOUBLE)\b", re.IGNORECASE)


def float_findings(path: Path) -> list[str]:
    found: list[str] = []
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        func = getattr(node, "func", None)
        if isinstance(node, ast.Call) and isinstance(func, ast.Name) and func.id == "float":
            found.append(f"{path.name}:{node.lineno} float call")
        if isinstance(node, ast.Name) and node.id == "float":
            found.append(f"{path.name}:{node.lineno} float")
        elif isinstance(node, ast.Constant) and isinstance(node.value, float):
            found.append(f"{path.name}:{node.lineno} float literal")
    return found


def money_files() -> list[Path]:
    return [
        SRC / "types" / "money.py",
        SRC / "config" / "money.py",
        *sorted((SRC / "service").glob("*.py")),
        *sorted((SRC / "repository").glob("*.py")),
    ]


def test_e1_s4_ac5_no_float_in_money_code_paths() -> None:
    files = [p for p in money_files() if p.exists()]
    assert len(files) >= 4
    assert [f for p in files for f in float_findings(p)] == []


def test_e1_s4_ac5_no_real_columns_in_migrations() -> None:
    sqls = list((BACKEND / "migrations").glob("*.sql"))
    assert sqls
    for sql in sqls:
        body = re.sub(r"--[^\n]*", "", sql.read_text(encoding="utf-8"))
        assert REAL_RE.search(body) is None, sql.name


def test_e1_s4_ac5_scanner_detects_float_call_type_and_real(tmp_path: Path) -> None:
    bad = tmp_path / "bad.py"
    bad.write_text("x: float = float('1')\ny = 1.5\n")
    assert len(float_findings(bad)) == 4
    assert REAL_RE.search("amount REAL NOT NULL")
