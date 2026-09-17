"""
Tests for model __repr__ implementations.
"""

import uuid

from app.models.chat import Conversation, Message, MessageCandidate
from app.models.template import WidgetTemplate
from app.models.user import User


def test_user_repr() -> None:
  """User __repr__ should include the email."""
  user = User(email="repr@example.com", hashed_password="pw", is_active=True)
  assert repr(user) == "<User repr@example.com>"


def test_template_repr() -> None:
  """WidgetTemplate __repr__ should include the title."""
  template = WidgetTemplate(title="Throughput", sql_template="SELECT 1", category="Flow")
  assert repr(template) == "<WidgetTemplate Throughput>"


def test_conversation_repr() -> None:
  """Conversation __repr__ should include title and id."""
  conv_id = uuid.uuid4()
  conv = Conversation(id=conv_id, user_id=uuid.uuid4(), title="ICU Trends")
  assert repr(conv) == f"<Conversation ICU Trends ({conv_id})>"


def test_message_repr_truncates_content() -> None:
  """Message __repr__ should include role and truncated content."""
  msg = Message(conversation_id=uuid.uuid4(), role="assistant", content="0123456789abcdefghijXYZ")
  assert repr(msg) == "<Message assistant: 0123456789abcdefghij...>"


def test_message_candidate_repr() -> None:
  """MessageCandidate __repr__ should include model name and message id."""
  msg_id = uuid.uuid4()
  cand = MessageCandidate(message_id=msg_id, model_name="ModelX", content="candidate")
  assert repr(cand) == f"<Candidate ModelX for Msg {msg_id}>"


def test_alert_rule_repr() -> None:
  """AlertRule __repr__ should include unit category, threshold and severity."""
  from app.models.alert_rule import AlertRule

  rule = AlertRule(
    unit_category="ICU",
    threshold_percentage=92.5,
    severity="CRITICAL",
  )
  assert repr(rule) == "<AlertRule ICU >= 92.5% [CRITICAL]>"


def test_refresh_token_repr() -> None:
  """RefreshToken __repr__ should include user_id and revoked state."""
  from app.models.token import RefreshToken

  uid = uuid.uuid4()
  tok = RefreshToken(user_id=uid, token_hash="hash123", is_revoked=False)
  assert repr(tok) == f"<RefreshToken user_id={uid} revoked=False>"
