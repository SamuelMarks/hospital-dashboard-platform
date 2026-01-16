"""
Tests for Authentication API.
Updated to verify that dashboard provisioning occurs during registration.
"""

import pytest
import uuid
from httpx import AsyncClient
from sqlalchemy import select
from app.models.dashboard import Dashboard
from app.models.template import WidgetTemplate

# Note: The 'client' and 'db_session' fixtures are provided by conftest.py


@pytest.mark.asyncio
async def test_register_flow_provisions_dashboard(client: AsyncClient, db_session):
  """
  Test that registration creates a user AND triggers provisioning.
  """
  # 1. Seed a template so provisioning has something to do
  t = WidgetTemplate(title="Test Metric", sql_template="SELECT 1", category="Test")
  db_session.add(t)
  await db_session.commit()

  # 2. Register
  email = f"provision_{uuid.uuid4()}@example.com"
  password = "strongpassword123"

  response = await client.post("/api/v1/auth/register", json={"email": email, "password": password})

  assert response.status_code == 200
  user_id = response.json()["id"]

  # 3. Verify Dashboard Existence via DB directly (simulating side-effect check)
  # We need a new session or to query via the client if we had an admin endpoint.
  # Since we share the testing DB, we can query it.

  # Note: In pytest-asyncio with shared session fixtures, sometimes commit visibility varies
  # depending on transaction isolation.
  # Here we rely on the fact that the API committed the transaction.

  # We query for dictionaries to avoid async session attachment issues in test context
  result = await db_session.execute(select(Dashboard).where(Dashboard.owner_id == uuid.UUID(user_id)))
  dash = result.scalars().first()

  assert dash is not None
  assert dash.name == "Hospital Command Center"


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
  """
  Test that registering with an existing email returns 400.
  """
  email = f"dup_{uuid.uuid4()}@example.com"
  password = "pwd"

  # 1. First Registration
  await client.post("/api/v1/auth/register", json={"email": email, "password": password})

  # 2. Duplicate Registration
  response = await client.post("/api/v1/auth/register", json={"email": email, "password": password})

  assert response.status_code == 400
  assert "already exists" in response.json()["detail"]


@pytest.mark.asyncio
async def test_login_flow(client: AsyncClient):
  """
  Test registration followed by login creates a valid token.
  """
  email = f"login_{uuid.uuid4()}@example.com"
  pwd = "password123"

  # Register
  await client.post("/api/v1/auth/register", json={"email": email, "password": pwd})

  # Login (OAuth2 uses form data)
  login_data = {"username": email, "password": pwd}
  response = await client.post("/api/v1/auth/login", data=login_data)

  assert response.status_code == 200
  token_data = response.json()
  assert "access_token" in token_data
  assert token_data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_failure(client: AsyncClient):
  """
  Test invalid credentials.
  """
  # Attempt login with non-existent user
  response = await client.post("/api/v1/auth/login", data={"username": "ghost@user.com", "password": "pwd"})
  assert response.status_code == 400
  assert response.json()["detail"] == "Incorrect email or password"


@pytest.mark.asyncio
async def test_me_protected(client: AsyncClient):
  """
  Test the /me endpoint requires authentication.
  """
  # 1. Unauthenticated
  response = await client.get("/api/v1/auth/me")
  assert response.status_code == 401

  # 2. Authenticated
  email = f"me_{uuid.uuid4()}@example.com"
  pwd = "abc"
  await client.post("/api/v1/auth/register", json={"email": email, "password": pwd})

  login = await client.post("/api/v1/auth/login", data={"username": email, "password": pwd})
  token = login.json()["access_token"]

  response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
  assert response.status_code == 200
  assert response.json()["email"] == email
