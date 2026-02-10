"""
Error-path coverage for templates router.
"""

import uuid

import pytest
from httpx import AsyncClient


async def _auth_headers(client: AsyncClient) -> dict:
  email = f"tmpl_err_{uuid.uuid4()}@example.com"
  pwd = "pw"
  await client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
  token = (await client.post("/api/v1/auth/login", data={"username": email, "password": pwd})).json()["access_token"]
  return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_get_template_not_found(client: AsyncClient) -> None:
  headers = await _auth_headers(client)
  res = await client.get(f"/api/v1/templates/{uuid.uuid4()}", headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_update_template_not_found(client: AsyncClient) -> None:
  headers = await _auth_headers(client)
  res = await client.put(
    f"/api/v1/templates/{uuid.uuid4()}",
    json={"title": "X", "description": "D", "sql_template": "S", "category": "C"},
    headers=headers,
  )
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_delete_template_not_found(client: AsyncClient) -> None:
  headers = await _auth_headers(client)
  res = await client.delete(f"/api/v1/templates/{uuid.uuid4()}", headers=headers)
  assert res.status_code == 404


@pytest.mark.asyncio
async def test_template_crud_success(client: AsyncClient) -> None:
  headers = await _auth_headers(client)

  create = await client.post(
    "/api/v1/templates/",
    json={
      "title": "Temp",
      "description": "D",
      "sql_template": "SELECT 1",
      "category": "Cat",
      "parameters_schema": {},
    },
    headers=headers,
  )
  assert create.status_code == 201
  template_id = create.json()["id"]

  # get
  res_get = await client.get(f"/api/v1/templates/{template_id}", headers=headers)
  assert res_get.status_code == 200

  # update
  res_update = await client.put(
    f"/api/v1/templates/{template_id}",
    json={"title": "Temp2", "description": "D2", "sql_template": "SELECT 2", "category": "C2"},
    headers=headers,
  )
  assert res_update.status_code == 200
  assert res_update.json()["title"] == "Temp2"

  # delete
  res_delete = await client.delete(f"/api/v1/templates/{template_id}", headers=headers)
  assert res_delete.status_code == 204
