"""E1-S4-AC4: one-way layering over backend and frontend sources (VM-018)."""

from __future__ import annotations

import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BACKEND_ORDER = ["types", "config", "repository", "service", "api"]
FRONTEND_ORDER = ["types", "config", "service", "api", "ui"]
IMPORT_RE = re.compile(r"""(?:from|import)\s+(?:[^'"\n;]*?\s+from\s+)?['"]([^'"]+)['"]""")


def _modules(node: ast.AST) -> list[str]:
    if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
        return [node.module]
    if isinstance(node, ast.Import):
        return [a.name for a in node.names]
    return []


def backend_violations(src: Path) -> list[str]:
    out: list[str] = []
    for f in src.rglob("*.py"):
        parts = f.relative_to(src).parts
        if len(parts) < 2 or parts[0] not in BACKEND_ORDER:
            continue
        own = BACKEND_ORDER.index(parts[0])
        for node in ast.walk(ast.parse(f.read_text(encoding="utf-8"))):
            for mod in _modules(node):
                bits = mod.split(".")
                if len(bits) > 1 and bits[0] == "truelend" and bits[1] in BACKEND_ORDER:
                    if BACKEND_ORDER.index(bits[1]) > own:
                        out.append(f"{f.name}: {parts[0]} imports {bits[1]}")
    return out


def _target_layer(spec: str, file: Path, src: Path) -> str | None:
    if spec.startswith("@/"):
        return spec[2:].split("/")[0]
    if spec.startswith("."):
        try:
            return (file.parent / spec).resolve().relative_to(src.resolve()).parts[0]
        except ValueError:
            return None
    return None


def frontend_violations(src: Path) -> list[str]:
    out: list[str] = []
    if not src.is_dir():
        return out
    for f in [*src.rglob("*.ts"), *src.rglob("*.tsx")]:
        parts = f.relative_to(src).parts
        if len(parts) < 2 or parts[0] not in FRONTEND_ORDER:
            continue
        own = FRONTEND_ORDER.index(parts[0])
        for m in IMPORT_RE.finditer(f.read_text(encoding="utf-8")):
            layer = _target_layer(m.group(1), f, src)
            if layer in FRONTEND_ORDER and FRONTEND_ORDER.index(layer) > own:
                out.append(f"{f.name}: {parts[0]} imports {layer}")
    return out


def test_e1_s4_ac4_backend_has_no_upward_imports() -> None:
    assert backend_violations(ROOT / "backend" / "src" / "truelend") == []


def test_e1_s4_ac4_frontend_has_no_upward_imports() -> None:
    assert frontend_violations(ROOT / "frontend" / "src") == []


def test_e1_s4_ac4_detector_catches_planted_backend_violation(tmp_path: Path) -> None:
    (tmp_path / "types").mkdir()
    (tmp_path / "types" / "bad.py").write_text("from truelend.service import x\n")
    assert backend_violations(tmp_path) == ["bad.py: types imports service"]


def test_e1_s4_ac4_detector_catches_planted_frontend_violation(tmp_path: Path) -> None:
    (tmp_path / "types").mkdir()
    (tmp_path / "ui").mkdir()
    (tmp_path / "types" / "bad.ts").write_text("import { X } from '../ui/X';\n")
    assert frontend_violations(tmp_path) == ["bad.ts: types imports ui"]
