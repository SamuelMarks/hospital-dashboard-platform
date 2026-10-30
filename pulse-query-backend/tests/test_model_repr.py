"""
Tests for ORM model `__repr__`, database persistence round-trips, and relational invariants.
"""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.admin_setting import AdminSetting
from app.models.alert_rule import AlertRule
from app.models.chat import Conversation, Message, MessageCandidate
from app.models.dashboard import Dashboard, DashboardShare, Widget
from app.models.feedback import ExperimentLog, ModelCandidate
from app.models.optimization import (
  OptimizationIteration,
  OptimizationSession,
  OptimizationUserSurvey,
)
from app.models.template import WidgetTemplate
from app.models.token import RefreshToken
from app.models.user import User


def test_user_repr() -> None:
  """User __repr__ should include the email and preserve role/active defaults."""
  user = User(email="repr@example.com", hashed_password="pw", is_active=True, role="ADMIN")
  assert repr(user) == "<User repr@example.com>"
  assert user.role == "ADMIN"
  assert user.is_active is True


def test_admin_setting_repr() -> None:
  """AdminSetting __repr__ should include the setting_key."""
  setting = AdminSetting(setting_key="visible_models", setting_value=["ollama:llama3"])
  assert repr(setting) == "<AdminSetting visible_models>"


def test_template_repr() -> None:
  """WidgetTemplate __repr__ should include the title and SQL template."""
  template = WidgetTemplate(title="Throughput", sql_template="SELECT 1", category="Flow")
  assert repr(template) == "<WidgetTemplate Throughput>"
  assert template.sql_template == "SELECT 1"


def test_conversation_repr() -> None:
  """Conversation __repr__ should include title and id."""
  conv_id = uuid.uuid4()
  conv = Conversation(id=conv_id, user_id=uuid.uuid4(), title="ICU Trends")
  assert repr(conv) == f"<Conversation ICU Trends ({conv_id})>"


def test_message_repr_truncates_and_short_content() -> None:
  """Message __repr__ should include role and first 20 chars of content for both long and short messages."""
  long_msg = Message(conversation_id=uuid.uuid4(), role="assistant", content="0123456789abcdefghijXYZ")
  assert repr(long_msg) == "<Message assistant: 0123456789abcdefghij...>"

  short_msg = Message(conversation_id=uuid.uuid4(), role="user", content="Hello ICU")
  assert repr(short_msg) == "<Message user: Hello ICU...>"


def test_message_candidate_repr() -> None:
  """MessageCandidate __repr__ should include model name and message id."""
  msg_id = uuid.uuid4()
  cand = MessageCandidate(message_id=msg_id, model_name="ModelX", content="candidate")
  assert repr(cand) == f"<Candidate ModelX for Msg {msg_id}>"


def test_alert_rule_repr() -> None:
  """AlertRule __repr__ should include unit category, threshold and severity."""
  rule = AlertRule(
    unit_category="ICU",
    threshold_percentage=92.5,
    severity="CRITICAL",
  )
  assert repr(rule) == "<AlertRule ICU >= 92.5% [CRITICAL]>"


def test_refresh_token_repr() -> None:
  """RefreshToken __repr__ should include user_id and revoked state."""
  uid = uuid.uuid4()
  tok = RefreshToken(user_id=uid, token_hash="hash123", is_revoked=False)
  assert repr(tok) == f"<RefreshToken user_id={uid} revoked=False>"


@pytest.mark.asyncio
async def test_dashboard_widget_and_feedback_model_invariants(db_session: AsyncSession) -> None:
  """Verifies DB persistence, default generation, relationships, and cascade delete on ORM models."""
  owner = User(email=f"orm_owner_{uuid.uuid4()}@example.com", hashed_password="pw")
  collaborator = User(email=f"orm_collab_{uuid.uuid4()}@example.com", hashed_password="pw")
  db_session.add_all([owner, collaborator])
  await db_session.commit()

  dash = Dashboard(name="Command Center", owner_id=owner.id)
  db_session.add(dash)
  await db_session.flush()
  assert dash.id is not None

  widget = Widget(
    dashboard_id=dash.id,
    title="ICU Census",
    type="SQL",
    visualization="bar",
    config={"query": "SELECT 1"},
  )
  share = DashboardShare(dashboard_id=dash.id, user_id=collaborator.id, permission_level="EDIT")
  exp = ExperimentLog(user_id=owner.id, prompt_text="Show ICU", prompt_strategy="zero-shot")
  db_session.add_all([widget, share, exp])
  await db_session.flush()

  cand = ModelCandidate(
    experiment_id=exp.id,
    model_identifier="openai:gpt-4o",
    model_tag="GPT-4o",
    generated_sql="SELECT 1",
    is_selected=True,
  )
  opt_session = OptimizationSession(
    user_id=owner.id,
    use_case="service_unit",
    institution_id="stanford_childrens",
    title="Bed-Use Optimization",
  )
  db_session.add_all([cand, opt_session])
  await db_session.flush()

  opt_iter = OptimizationIteration(
    session_id=opt_session.id,
    turn_index=1,
    user_prompt="Place all Gen Peds on PCU 350",
    model_id="gemini-2.5-pro",
    assistant_explanation="Explanation",
    expert_baseline_gap=1.5,
  )
  opt_survey = OptimizationUserSurvey(
    user_id=owner.id,
    session_id=opt_session.id,
    use_case="service_unit",
    role_category="Physician",
    score_vs_manual_process=5,
    score_vs_other_workflow_tech=5,
    interpretability_score=5,
    qualitative_feedback="Much faster than email!",
  )
  db_session.add_all([opt_iter, opt_survey])
  await db_session.commit()

  assert "OptimizationSession" in repr(opt_session)
  assert "OptimizationIteration" in repr(opt_iter)
  assert "OptimizationUserSurvey" in repr(opt_survey)

  loaded_dash = (
    (
      await db_session.execute(
        select(Dashboard)
        .where(Dashboard.id == dash.id)
        .options(selectinload(Dashboard.widgets), selectinload(Dashboard.shares))
      )
    )
    .scalars()
    .one()
  )
  assert loaded_dash.name == "Command Center"
  assert len(loaded_dash.widgets) == 1
  assert loaded_dash.widgets[0].config["query"] == "SELECT 1"
  assert len(loaded_dash.shares) == 1
  assert loaded_dash.shares[0].permission_level == "EDIT"

  # Deleting dashboard cascades to widgets and shares
  await db_session.delete(loaded_dash)
  await db_session.commit()

  remaining_widgets = (await db_session.execute(select(Widget).where(Widget.id == widget.id))).scalars().all()
  assert remaining_widgets == []
