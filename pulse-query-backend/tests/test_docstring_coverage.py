"""
AST Docstring Coverage Verification Tests for `pulse-query-backend` and root `scripts/`.

Verifies that 100% of modules, classes, functions, and methods across `src/app/`,
`scripts/`, `alembic/`, and root `scripts/` contain substantive docstrings.
"""

import ast
from pathlib import Path
import re
import xml.etree.ElementTree as ET

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
APP_DIR = BACKEND_ROOT / "src" / "app"
SCRIPTS_DIR = BACKEND_ROOT / "scripts"
ALEMBIC_DIR = BACKEND_ROOT / "alembic"
ROOT_SCRIPTS_DIR = REPO_ROOT / "scripts"
KMP_SRC_DIR = REPO_ROOT / "PulseQuery" / "composeApp" / "src"
WEB_APP_DIR = REPO_ROOT / "pulse-query-ng-web" / "src" / "app"
BACKEND_TESTS_DIR = BACKEND_ROOT / "tests"

_KT_DECL_RE = re.compile(
  r"^(?:(?:public|internal|private|protected|override|open|abstract|suspend|inline|data|sealed|value|enum|actual|expect|operator|infix|tailrec|external|final)\s+)*(?:fun|class|interface|object|typealias)\b"
)


def _collect_missing_arg_docs(
  node: ast.FunctionDef | ast.AsyncFunctionDef,
  doc: str,
  rel: Path,
  is_protocol: bool = False,
) -> list[str]:
  """
  Returns diagnostic strings for any non-private, non-receiver parameters or return values missing from `doc`.

  Args:
      node (ast.FunctionDef | ast.AsyncFunctionDef): Function or method AST node.
      doc (str): Extracted docstring text.
      rel (Path): Relative path of the Python file.
      is_protocol (bool): Whether the enclosing class is a `typing.Protocol`.

  Returns:
      list[str]: Missing argument or return docstring diagnostics.
  """
  all_args = [a.arg for a in node.args.posonlyargs + node.args.args + node.args.kwonlyargs]
  if node.args.vararg:
    all_args.append(node.args.vararg.arg)
  if node.args.kwarg:
    all_args.append(node.args.kwarg.arg)
  missing = [
    f"{rel}:{node.lineno} {node.name}: missing arg '{arg_name}' in docstring"
    for arg_name in all_args
    if arg_name not in ("self", "cls") and not arg_name.startswith("_") and arg_name not in doc
  ]
  is_dunder = node.name.startswith("__") and node.name.endswith("__")
  is_prop = any(isinstance(d, ast.Name) and d.id == "property" for d in node.decorator_list)
  has_non_none_return = node.returns is not None and not (
    isinstance(node.returns, ast.Constant) and node.returns.value is None
  )
  if (
    not is_protocol
    and not is_dunder
    and not is_prop
    and has_non_none_return
    and "Returns:" not in doc
    and "Yields:" not in doc
  ):
    missing.append(f"{rel}:{node.lineno} {node.name}: missing Returns:/Yields: in docstring")
  return missing


def _check_kotlin_main_file(kt_file: Path) -> list[str]:
  """
  Verifies declaration KDocs and bans raw `runCatching` in a Kotlin `*Main` source file.

  Args:
      kt_file (Path): Kotlin source file path under a `*Main` source set.

  Returns:
      list[str]: List of KDoc or `runCatching` violation messages.
  """
  rel = kt_file.relative_to(REPO_ROOT)
  text = kt_file.read_text(encoding="utf-8")
  errors: list[str] = []
  if re.search(r"\brunCatching\s*\{", text):
    errors.append(f"{rel}: raw runCatching found in Main source set; use runCatchingPulse")
  if ".getOrThrow(" in text or re.search(r"\berror\s*\(", text):
    errors.append(f"{rel}: forbidden getOrThrow() or error() found in Main source set; use Result")
  lines = text.splitlines()
  for idx, line in enumerate(lines):
    s = line.strip()
    if not s.startswith(("//", "*", "/*")) and _KT_DECL_RE.match(s):
      window = "\n".join(lines[max(0, idx - 25) : idx])
      if "*/" not in window:
        errors.append(f"{rel}:{idx + 1}: missing KDoc on '{s[:50]}'")
  return errors


def test_all_python_modules_classes_and_functions_have_docstrings() -> None:
  """
  Parses every Python source file in `src/app`, `scripts`, `alembic`, and root `scripts`
  and asserts 100% module, class, function, method, and argument docstring coverage.
  """
  py_files = sorted(
    list(APP_DIR.rglob("*.py"))
    + list(SCRIPTS_DIR.rglob("*.py"))
    + list(ALEMBIC_DIR.rglob("*.py"))
    + list(ROOT_SCRIPTS_DIR.glob("*.py"))
  )
  assert len(py_files) > 65

  missing_docs: list[str] = []

  for py_file in py_files:
    rel = py_file.relative_to(REPO_ROOT)
    tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(rel))
    if not ast.get_docstring(tree):
      missing_docs.append(f"{rel}: missing module docstring")

    for parent in ast.walk(tree):
      if isinstance(parent, ast.ClassDef):
        doc = ast.get_docstring(parent)
        if not doc or not doc.strip():
          missing_docs.append(f"{rel}:{parent.lineno} {parent.name}: missing docstring")
      if not isinstance(parent, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
        continue
      is_proto = isinstance(parent, ast.ClassDef) and any(
        (isinstance(b, ast.Name) and b.id == "Protocol") or (isinstance(b, ast.Attribute) and b.attr == "Protocol")
        for b in parent.bases
      )
      for node in parent.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
          doc = ast.get_docstring(node)
          if not doc or not doc.strip():
            missing_docs.append(f"{rel}:{node.lineno} {node.name}: missing docstring")
          else:
            missing_docs.extend(_collect_missing_arg_docs(node, doc, rel, is_protocol=is_proto))

  assert missing_docs == [], f"Found undocumented symbols or arguments: {missing_docs}"


def test_kotlin_kdoc_and_result_invariants() -> None:
  """
  Verifies 100% file-level KDoc across all 270+ Kotlin files, 100% declaration KDoc and zero raw
  `runCatching` across all `*Main` Kotlin files, and zero `!!` non-null assertions outside strings.
  """
  kt_files = sorted(KMP_SRC_DIR.rglob("*.kt"))
  assert len(kt_files) >= 270
  violations: list[str] = []
  for kt_file in kt_files:
    rel = kt_file.relative_to(REPO_ROOT)
    text = kt_file.read_text(encoding="utf-8")
    if not text.lstrip().startswith("/**"):
      violations.append(f"{rel}: missing file-level KDoc header")
    stripped_strings = re.sub(r'"(?:\\.|[^"\\])*"', '""', text)
    if "!!" in stripped_strings:
      violations.append(f"{rel}: forbidden non-null assertion operator (!!) found")
    if "Test" not in str(rel):
      violations.extend(_check_kotlin_main_file(kt_file))
  assert violations == [], f"Kotlin KDoc / Result invariants violated: {violations}"


def test_zero_tautological_assertions_across_all_test_suites() -> None:
  """
  Verifies that no Python, Angular TypeScript, or Kotlin test suite contains tautological assertions
  (`expect(true).toBe(true)`, `expect(false).toBe(false)`, `assert True`, or `assertTrue(true)`).
  """
  violations: list[str] = []
  for ts_spec in sorted(WEB_APP_DIR.rglob("*.spec.ts")):
    spec_text = ts_spec.read_text(encoding="utf-8")
    if "expect(true).toBe(true)" in spec_text or "expect(false).toBe(false)" in spec_text:
      violations.append(str(ts_spec.relative_to(REPO_ROOT)))
  for py_test in sorted(BACKEND_TESTS_DIR.glob("test_*.py")):
    if py_test.name != "test_docstring_coverage.py" and re.search(
      r"\bassert\s+(?:True|1\s*==\s*1)\b", py_test.read_text(encoding="utf-8")
    ):
      violations.append(str(py_test.relative_to(REPO_ROOT)))
  for kt_test in sorted(KMP_SRC_DIR.rglob("*Test.kt")):
    if re.search(r"\bassertTrue\(\s*true\s*\)|\bassertFalse\(\s*false\s*\)", kt_test.read_text(encoding="utf-8")):
      violations.append(str(kt_test.relative_to(REPO_ROOT)))
  assert violations == [], f"Tautological test assertions found: {violations}"


def test_kotlin_i18n_strings_xml_parity() -> None:
  """
  Verifies 100% `<string>` and `<plurals>` key parity across English (`values/strings.xml`),
  Spanish (`values-es/strings.xml`), and French (`values-fr/strings.xml`) Compose resources.
  """
  res_dir = KMP_SRC_DIR / "commonMain" / "composeResources"
  en_root = ET.parse(res_dir / "values" / "strings.xml").getroot()
  es_root = ET.parse(res_dir / "values-es" / "strings.xml").getroot()
  fr_root = ET.parse(res_dir / "values-fr" / "strings.xml").getroot()

  en_strings = {el.attrib["name"] for el in en_root.findall("string")}
  es_strings = {el.attrib["name"] for el in es_root.findall("string")}
  fr_strings = {el.attrib["name"] for el in fr_root.findall("string")}

  en_plurals = {el.attrib["name"] for el in en_root.findall("plurals")}
  es_plurals = {el.attrib["name"] for el in es_root.findall("plurals")}
  fr_plurals = {el.attrib["name"] for el in fr_root.findall("plurals")}

  assert en_strings == es_strings, f"ES string mismatch: {en_strings ^ es_strings}"
  assert en_strings == fr_strings, f"FR string mismatch: {en_strings ^ fr_strings}"
  assert en_plurals == es_plurals, f"ES plurals mismatch: {en_plurals ^ es_plurals}"
  assert en_plurals == fr_plurals, f"FR plurals mismatch: {en_plurals ^ fr_plurals}"
