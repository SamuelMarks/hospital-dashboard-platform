# ==============================================================================
# Hospital Dashboard Platform (Pulse Query) - Secrets Template (.env.secrets.tpl)
# Copy this file to `.env.secrets` and populate with your credentials.
# Never commit `.env.secrets` to version control.
# ==============================================================================

# --- Application & Database Credentials ---
SECRET_KEY=CHANGEME_IN_PROD_SUPER_SECRET_KEY
POSTGRES_PASSWORD=postgres

# --- Optional: Email / SMTP Credentials ---
SMTP_PASSWORD=

# --- Optional: Local & Cloud LLM API Keys ---
LLM_LOCAL_API_KEY=EMPTY
OPENAI_API_KEY=
GEMINI_API_KEY=
GOOGLE_API_KEY=
MISTRAL_API_KEY=
ANTHROPIC_API_KEY=
