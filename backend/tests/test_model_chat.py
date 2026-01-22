"""
Tests for Chat Persistence Models.
"""

import pytest
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.chat import Conversation, Message, MessageCandidate


@pytest.fixture
async def chat_user(db_session: AsyncSession) -> User:
  user = User(email=f"chat_{uuid.uuid4()}@example.com", hashed_password="pw", is_active=True)
  db_session.add(user)
  await db_session.commit()
  await db_session.refresh(user)
  return user


@pytest.mark.asyncio
async def test_candidates_relationship(db_session: AsyncSession, chat_user: User) -> None:
  """
  Verify Message -> Candidates One-to-Many logic.
  """
  conv = Conversation(user_id=chat_user.id, title="Candidate Test")
  db_session.add(conv)
  await db_session.commit()

  msg = Message(conversation_id=conv.id, role="assistant", content="Pending")
  db_session.add(msg)
  await db_session.commit()

  c1 = MessageCandidate(message_id=msg.id, model_name="M1", content="C1")
  c2 = MessageCandidate(message_id=msg.id, model_name="M2", content="C2")
  db_session.add_all([c1, c2])
  await db_session.commit()

  # Reload
  db_session.expunge_all()

  reloaded_msg = await db_session.execute(
    select(Message).where(Message.id == msg.id).options(selectinload(Message.candidates))
  )
  m = reloaded_msg.scalars().first()

  assert len(m.candidates) == 2
  names = {c.model_name for c in m.candidates}
  assert "M1" in names
  assert "M2" in names
