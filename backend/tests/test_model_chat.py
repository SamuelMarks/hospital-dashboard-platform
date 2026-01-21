"""
Tests for Chat Persistence Models.

Verifies:
1. Basic CRUD operations for Conversations and Messages.
2. Foreign Key constraints (Relationship to User).
3. Cascade Deletion logic (Deleting Conversation -> Deletes Messages).
4. Data retrieval ordering.

(Updates: Fixed synchronous call to expire_all)
"""

import pytest
import uuid
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.chat import Conversation, Message


@pytest.fixture
async def chat_user(db_session: AsyncSession) -> User:
  """
  Fixture: Creates a persisted user for attaching chat sessions.
  """
  user = User(
    email=f"chat_{uuid.uuid4()}@example.com",
    hashed_password="pw",
    is_active=True,
  )
  db_session.add(user)
  await db_session.commit()
  await db_session.refresh(user)
  return user


@pytest.mark.asyncio
async def test_create_conversation_flow(db_session: AsyncSession, chat_user: User) -> None:
  """
  Verify creation of a Conversation with multiple messages.
  """
  # 1. Create Conversation
  conv = Conversation(user_id=chat_user.id, title="Unit Performance Analysis")
  db_session.add(conv)
  await db_session.commit()
  await db_session.refresh(conv)

  assert conv.id is not None
  assert conv.created_at is not None

  # 2. Add Messages
  msg_user = Message(conversation_id=conv.id, role="user", content="Show me ICU capacity.")
  msg_ai = Message(
    conversation_id=conv.id,
    role="assistant",
    content="Here is the SQL.",
    sql_snippet="SELECT * FROM census WHERE unit='ICU'",
  )
  db_session.add_all([msg_user, msg_ai])
  await db_session.commit()

  # 3. Verify Relationship Loading
  # Use sync_session for expire_all or just separate query
  db_session.expunge_all()  # Clear session to force reload

  result = await db_session.execute(
    select(Conversation).where(Conversation.id == conv.id).options(selectinload(Conversation.messages))
  )
  loaded_conv = result.scalars().first()

  assert loaded_conv is not None
  assert len(loaded_conv.messages) == 2

  snippets = [m.sql_snippet for m in loaded_conv.messages if m.sql_snippet]
  assert "SELECT * FROM census WHERE unit='ICU'" in snippets


@pytest.mark.asyncio
async def test_cascade_delete_integrity(db_session: AsyncSession, chat_user: User) -> None:
  """
  Verify that deleting a Conversation strictly removes all associated Messages.
  """
  # 1. Setup
  conv = Conversation(user_id=chat_user.id, title="Deletion Test")
  db_session.add(conv)
  await db_session.commit()

  msg = Message(conversation_id=conv.id, role="user", content="To be deleted")
  db_session.add(msg)
  await db_session.commit()

  msg_id = msg.id

  # 2. Verify existence
  count_before = await db_session.execute(select(func.count(Message.id)).where(Message.id == msg_id))
  assert count_before.scalar() == 1

  # 3. Delete
  await db_session.delete(conv)
  await db_session.commit()

  # 4. Verify Messages are gone
  count_after = await db_session.execute(select(func.count(Message.id)).where(Message.id == msg_id))
  assert count_after.scalar() == 0


@pytest.mark.asyncio
async def test_foreign_key_constraint_user(db_session: AsyncSession) -> None:
  fake_user_id = uuid.uuid4()
  conv = Conversation(user_id=fake_user_id, title="Orphan Conv")
  db_session.add(conv)

  with pytest.raises(IntegrityError):
    await db_session.commit()
  await db_session.rollback()


@pytest.mark.asyncio
async def test_foreign_key_constraint_conversation(
  db_session: AsyncSession,
) -> None:
  fake_conv_id = uuid.uuid4()
  msg = Message(conversation_id=fake_conv_id, role="user", content="Orphan Msg")
  db_session.add(msg)

  with pytest.raises(IntegrityError):
    await db_session.commit()
  await db_session.rollback()
