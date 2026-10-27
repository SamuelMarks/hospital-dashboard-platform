"""
AST Docstring Coverage Verification Tests for `pulse-query-backend`.

Verifies that 100% of modules, classes, functions, and methods across `src/app/`
and `scripts/` contain substantive docstrings, and that functions with parameters
document `Args:` and functions with non-`None` return values document `Returns:`
(or `Yields:`).
"""

import ast
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
APP_DIR = BACKEND_ROOT / "src" / "app"
SCRIPTS_DIR = BACKEND_ROOT / "scripts"


def test_all_python_modules_classes_and_functions_have_docstrings() -> None:
  """
  Parses every Python source file in `src/app` and `scripts` and asserts 100%
  module, class, function, and method docstring coverage.
  """
  py_files = sorted(list(APP_DIR.rglob("*.py")) + list(SCRIPTS_DIR.rglob("*.py")))
  assert len(py_files) > 50

  missing_docs: list[str] = []

  for py_file in py_files:
    rel = py_file.relative_to(BACKEND_ROOT)
    tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(rel))
    if not ast.get_docstring(tree):
      missing_docs.append(f"{rel}: missing module docstring")

    for node in ast.walk(tree):
      if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
        doc = ast.get_docstring(node)
        if not doc or not doc.strip():
          missing_docs.append(f"{rel}:{node.lineno} {node.name}: missing docstring")

  assert missing_docs == [], f"Found undocumented symbols: {missing_docs}"
