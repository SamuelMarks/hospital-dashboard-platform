import pytest
from app.core.i18n import Translator, get_translated_message


def test_translator_fallback():
  # Test valid language
  msg = get_translated_message("en-US", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  # Test complex Accept-Language
  msg = get_translated_message("es-ES,es;q=0.9,en;q=0.8", "error.invalid_credentials")
  assert msg == "Correo o contraseña incorrectos"

  # Test complex Accept-Language with bad format
  msg = get_translated_message("es-ES;", "error.invalid_credentials")
  assert msg == "Correo o contraseña incorrectos"

  msg = get_translated_message("es-ES-bad", "error.invalid_credentials")
  assert msg == "Correo o contraseña incorrectos"

  # Test completely bad accept lang format
  msg = get_translated_message(";", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  msg = get_translated_message("-", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  msg = get_translated_message("-", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  # Test missing language falls back to default
  msg = get_translated_message("fr-FR", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  # Test unknown language falling back to en where key missing defaults to key
  msg = get_translated_message("zh", "some.weird.key")
  assert msg == "some.weird.key"

  # Test none language
  msg = get_translated_message(None, "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  # Test empty string language
  msg = get_translated_message("", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  # Test multiple languages where first is skipped because empty
  msg = get_translated_message(",es", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  # Test multiple languages where first is valid
  msg = get_translated_message("es,en-US;q=0.9", "error.invalid_credentials")
  assert msg == "Correo o contraseña incorrectos"

  # Test short prefix
  msg = get_translated_message("a-b", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  # Test es missing key
  msg = get_translated_message("es", "missing.key", "Hola Default")
  assert msg == "Hola Default"

  # Test malformed but with subparts without first
  msg = get_translated_message("-en", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  msg = get_translated_message("-a;b", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  msg = get_translated_message("a;b", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  # Test unknown language falling back to default
  msg = get_translated_message("zh", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  # Test malformed with no parts after split
  msg = get_translated_message("  ", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  msg = get_translated_message("a;b", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  # Branch missing condition: parts > 0 but not parts[0]
  msg = get_translated_message(",en", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  msg = get_translated_message("a-b;c", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  msg = get_translated_message("a-", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  # Test valid but missing language
  msg = get_translated_message("zh-CN", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  # Test translator without dir passed
  t = Translator()
  assert t.get_message("en", "error.invalid_credentials") == "Incorrect email or password"

  # Test translator language not in dictionary
  assert t.get_message("ru", "error.invalid_credentials") == "Incorrect email or password"

  # Test malformed but valid
  msg = get_translated_message("es;", "error.invalid_credentials")
  assert msg == "Correo o contraseña incorrectos"

  # Test malformed where there's no dash but parts
  msg = get_translated_message("es;q=0.9", "error.invalid_credentials")
  assert msg == "Correo o contraseña incorrectos"

  # Test malformed where first part is empty string
  msg = get_translated_message(",es", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  # Test spanish
  msg = get_translated_message("es", "error.invalid_credentials")
  assert msg == "Correo o contraseña incorrectos"

  # Test missing separator branch
  msg = get_translated_message("a", "error.invalid_credentials")
  assert msg == "Incorrect email or password"

  # Test malformed but parseable Accept-Language
  msg = get_translated_message("es;", "error.invalid_credentials")
  assert msg == "Correo o contraseña incorrectos"

  # Test missing key returns default arg
  msg = get_translated_message("en", "missing.key", "My Default")
  assert msg == "My Default"

  # Test missing key without default returns key
  msg = get_translated_message("en", "missing.key2")
  assert msg == "missing.key2"


def test_load_locales(tmp_path):
  import json

  locale_dir = tmp_path / "locales"
  locale_dir.mkdir()

  # Create fake locale
  es_file = locale_dir / "es.json"
  with open(es_file, "w", encoding="utf-8") as f:
    json.dump({"test.msg": "Hola mundo"}, f)

  # Create a new language file to hit self.messages[lang] = {}
  de_file = locale_dir / "de.json"
  with open(de_file, "w", encoding="utf-8") as f:
    json.dump({"test.msg": "Hallo Welt"}, f)

  t = Translator(str(locale_dir))
  assert t.get_message("es", "test.msg") == "Hola mundo"
  assert t.get_message("de", "test.msg") == "Hallo Welt"

  # Test missing file gracefully handled
  t.load_locales("/invalid/dir/path")

  import os

  # Create fake directory but it's actually a file
  not_dir = locale_dir / "not_dir"
  with open(not_dir, "w", encoding="utf-8") as f:
    f.write("text")
  t.load_locales(str(not_dir))

  # Invalid json handled gracefully
  bad_file = locale_dir / "bad.json"
  with open(bad_file, "w", encoding="utf-8") as f:
    f.write("{ bad json ")

  t.load_locales(str(locale_dir))

  # Try directory without permissions or similar error gracefully
  os.chmod(str(bad_file), 0o000)
  t.load_locales(str(locale_dir))
  os.chmod(str(bad_file), 0o644)

  # Check that the print fallback exception is hit for json decode error
  bad_json = locale_dir / "bad_format.json"
  with open(bad_json, "w", encoding="utf-8") as f:
    f.write("{ invalid")
  t.load_locales(str(locale_dir))
