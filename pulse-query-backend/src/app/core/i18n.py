"""
Internationalization and localization support for the application.
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# A simple fallback dictionary if no files are loaded
_FALLBACK_MESSAGES: dict[str, dict[str, str]] = {
  "en": {
    "error.invalid_credentials": "Incorrect email or password",
    "error.inactive_user": "Inactive user",
    "error.user_exists": "Email already registered",
    "error.user_not_found": "User not found",
    "error.admin_required": "Admin privileges required.",
    "error.self_suspension_forbidden": "Administrators cannot suspend their own active account.",
    "error.dashboard_not_found": "Dashboard not found",
    "error.widget_not_found": "Widget not found",
    "error.template_not_found": "Template not found",
    "error.alert_rule_not_found": "Alert rule not found",
    "error.share_not_found": "Share not found",
    "error.target_user_not_found": "Target user not found",
    "error.share_self_forbidden": "Cannot share dashboard with yourself",
    "error.share_invalid_permission": "Permission level must be VIEW or EDIT",
    "error.conversation_not_found": "Conversation not found",
    "error.candidate_not_found": "Candidate not found",
    "error.simulation_failed": "Simulation Failed",
    "error.invalid_sql": "Invalid SQL syntax.",
    "error.invalid_processor": "Invalid processor identifier. Expected 'SQL' or '<provider>:<model>'.",
    "error.natural_text_generation_failed": "Failed to generate SQL from natural text.",
  },
  "es": {
    "error.invalid_credentials": "Correo o contraseña incorrectos",
    "error.inactive_user": "Usuario inactivo",
    "error.user_exists": "El correo electrónico ya está registrado",
    "error.user_not_found": "Usuario no encontrado",
    "error.admin_required": "Se requieren privilegios de administrador.",
    "error.self_suspension_forbidden": "Los administradores no pueden suspender su propia cuenta activa.",
    "error.dashboard_not_found": "Panel no encontrado",
    "error.widget_not_found": "Widget no encontrado",
    "error.template_not_found": "Plantilla no encontrada",
    "error.alert_rule_not_found": "Regla de alerta no encontrada",
    "error.share_not_found": "Recurso compartido no encontrado",
    "error.target_user_not_found": "Usuario de destino no encontrado",
    "error.share_self_forbidden": "No puedes compartir un panel contigo mismo",
    "error.share_invalid_permission": "El nivel de permiso debe ser VIEW o EDIT",
    "error.conversation_not_found": "Conversación no encontrada",
    "error.candidate_not_found": "Candidato no encontrado",
    "error.simulation_failed": "Simulación fallida",
    "error.invalid_sql": "Sintaxis SQL inválida.",
    "error.invalid_processor": "Identificador de procesador inválido. Se esperaba 'SQL' o '<proveedor>:<modelo>'.",
    "error.natural_text_generation_failed": "Error al generar SQL a partir de texto natural.",
  },
}


class Translator:
  """Translator class to manage loading and retrieving localized messages."""

  def __init__(self, locales_dir: str | None = None) -> None:
    """
    Initializes translator with fallback dictionaries and optional locale directory.

    Args:
        locales_dir (str | None): Optional directory path containing `*.json` locale files.
    """
    self.messages: dict[str, dict[str, str]] = {k: dict(v) for k, v in _FALLBACK_MESSAGES.items()}
    if locales_dir:
      self.load_locales(locales_dir)

  def load_locales(self, locales_dir: str) -> None:
    """
    Loads locale JSON files from the specified directory.

    Args:
        locales_dir (str): Directory path containing `*.json` translation files.
    """
    p = Path(locales_dir)
    if p.exists() and p.is_dir():
      for f in p.glob("*.json"):
        lang = f.stem
        try:
          with open(f, "r", encoding="utf-8") as file:
            data = json.load(file)
            if lang not in self.messages:
              self.messages[lang] = {}
            self.messages[lang].update(data)
        except Exception as exc:
          logger.warning(f"Failed to load locale file {f}: {exc}")

  def get_message(self, lang: str, key: str, default: str | None = None) -> str:
    """
    Retrieves a message for the given language and key, optionally returning a default.

    Args:
        lang (str): ISO language code (e.g., `'en'`, `'es'`).
        key (str): Dot-separated translation key.
        default (str | None): Optional fallback string if key is absent.

    Returns:
        str: Translated message string.
    """
    if lang not in self.messages:
      lang = "en"
    return self.messages.get(lang, {}).get(key, default or key)


# Global translator instance
translator = Translator()


def get_translated_message(accept_language: str | None, key: str, default: str | None = None) -> str:
  """
  Extracts primary language from `Accept-Language` header and translates `key`.

  Args:
      accept_language (str | None): Raw HTTP `Accept-Language` header value.
      key (str): Translation message key.
      default (str | None): Fallback message if key is not found.

  Returns:
      str: Localized message string.
  """
  lang = "en"
  if accept_language:
    lang = accept_language.split(",")[0].split(";")[0].strip().split("-")[0].lower()

  return translator.get_message(lang, key, default)
