"""
Tests for the Templates API Router.

Verifies the CRUD functionality for the Widget Template Registry.
Now includes tests for Server-Side Search and Pagination.
"""

import pytest
import uuid
from httpx import AsyncClient
from app.main import app

# Base URL for template endpoints
TEMPLATES_URL = "/api/v1/templates"


@pytest.mark.anyio
async def test_search_functionality(client: AsyncClient) -> None:
  """
  Test server-side text searching.

  Creates multiple templates and verifies that the search query parameter
  correctly filters the results by title.

  Args:
      client (AsyncClient): Authenticated HTTP client fixture.
  """
  # 1. Auth & Setup
  email = f"searcher_{uuid.uuid4()}@example.com"
  pwd = "pwd"
  await client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
  token = (await client.post("/api/v1/auth/login", data={"username": email, "password": pwd})).json()["access_token"]
  headers = {"Authorization": f"Bearer {token}"}

  # 2. Seed Non-matching and Matching items
  # Note: Description is added to ensure SQL boolean logic (OR) has non-null values
  res1 = await client.post(
    f"{TEMPLATES_URL}/",
    json={
      "title": "Admissions Report",
      "description": "Analysis of daily admissions",
      "sql_template": "S1",
      "category": "Access",
      "parameters_schema": {},
    },
    headers=headers,
  )
  assert res1.status_code == 201, f"Create 1 failed: {res1.text}"

  res2 = await client.post(
    f"{TEMPLATES_URL}/",
    json={
      "title": "Discharge Metrics",
      "description": "Tracking patient flow out",
      "sql_template": "S2",
      "category": "Access",
      "parameters_schema": {},
    },
    headers=headers,
  )
  assert res2.status_code == 201, f"Create 2 failed: {res2.text}"

  # 3. Validation Double-Check (Pre-search)
  # Ensure the items are actually listed by the default endpoint before searching
  res_all = await client.get(f"{TEMPLATES_URL}/", headers=headers)
  assert res_all.status_code == 200
  all_items = res_all.json()

  # Expect at least 2 items we just created
  assert len(all_items) >= 2, "Items were not persisted correctly in test transaction"

  # Search term "Admission" appears in "Admissions Report"
  # (Note: "Admit" does NOT appear in "Admissions")
  match_term = "Admission"
  matches = [t for t in all_items if match_term in t["title"] or match_term in (t.get("description") or "")]
  assert len(matches) == 1, "Python logic expects exactly 1 match for 'Admission' in seeded data"

  # 4. Search for "Admission" using API
  res = await client.get(f"{TEMPLATES_URL}/?search={match_term}", headers=headers)
  assert res.status_code == 200
  data = res.json()
  assert len(data) == 1
  assert data[0]["title"] == "Admissions Report"

  # 5. Search for "Metrics" (Case insensitive check, via description or title)
  res_search = await client.get(f"{TEMPLATES_URL}/?search=metrics", headers=headers)
  assert res_search.status_code == 200
  data_search = res_search.json()
  assert len(data_search) == 1
  assert data_search[0]["title"] == "Discharge Metrics"


@pytest.mark.anyio
async def test_limit_pagination(client: AsyncClient) -> None:
  """
  Test that limit restricts the result size.

  Creates 3 templates and requests a limit of 2, verifying the response count.

  Args:
      client (AsyncClient): Authenticated HTTP client fixture.
  """
  email = f"limiter_{uuid.uuid4()}@example.com"
  await client.post("/api/v1/auth/register", json={"email": email, "password": "x"})
  token = (await client.post("/api/v1/auth/login", data={"username": email, "password": "x"})).json()["access_token"]
  headers = {"Authorization": f"Bearer {token}"}

  # Create 3 templates
  for i in range(3):
    res = await client.post(
      f"{TEMPLATES_URL}/",
      json={
        "title": f"T_{i}",
        "description": f"Desc {i}",
        "sql_template": "S",
        "category": "Logistics",
        "parameters_schema": {},
      },
      headers=headers,
    )
    assert res.status_code == 201

  # Request Limit 2
  res = await client.get(f"{TEMPLATES_URL}/?limit=2&category=Logistics", headers=headers)

  assert res.status_code == 200
  assert len(res.json()) == 2
