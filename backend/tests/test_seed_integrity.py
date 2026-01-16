"""
Tests for Template Seeding Integrity.

Verifies that the content pack JSON is valid, contains the required items,
and that the seeding service correctly persists them to the database.
"""

import json
import os
import pytest
from sqlalchemy import select, func
from app.services.template_seeder import TemplateSeeder, DATA_FILE
from app.models.template import WidgetTemplate


@pytest.fixture
def content_pack():
  """Load the JSON file from disk."""
  if not os.path.exists(DATA_FILE):
    pytest.fail(f"Content Pack JSON missing: {DATA_FILE}")

  with open(DATA_FILE, "r", encoding="utf-8") as f:
    return json.load(f)


def test_json_structure_validity(content_pack):
  """
  Static verification of the JSON file structure.
  """
  assert len(content_pack) > 5, f"Expected at least 5 templates, found {len(content_pack)}"

  required_keys = {"title", "description", "category", "sql_template", "parameters_schema"}

  for idx, template in enumerate(content_pack):
    missing = required_keys - template.keys()
    assert not missing, f"Item {idx} ({template.get('title')}) missing keys: {missing}"

    # Verify specific content integrity for key items if they exist
    if template["title"] == "Utilization Spikes":
      assert "daily_util" in template["sql_template"]
      assert "unit_name" in template["parameters_schema"]["properties"]


@pytest.mark.asyncio
async def test_seeding_service_execution(db_session, content_pack):
  """
  Integration test: Run the Seeder Service against the test DB
  and verify persistence.
  """
  # 1. Run Seeding Logic (Manual invocation of internal method to use test session)
  test_subset = [content_pack[0], content_pack[1], content_pack[-1]]

  await TemplateSeeder._process_batch(db_session, test_subset)
  await db_session.commit()

  # 2. Verify Count in DB
  count_res = await db_session.execute(select(func.count()).select_from(WidgetTemplate))
  assert count_res.scalar() == 3


@pytest.mark.asyncio
async def test_idempotency(db_session, content_pack):
  """
  Verify that running the seed logic twice doesn't duplicate records
  and correctly updates fields.
  """
  item = content_pack[0]
  data_list_v1 = [item]

  # Run 1
  await TemplateSeeder._process_batch(db_session, data_list_v1)
  await db_session.commit()

  # Run 2 with modified description
  item_v2 = item.copy()
  item_v2["description"] = "Updated Description for Test"
  data_list_v2 = [item_v2]

  await TemplateSeeder._process_batch(db_session, data_list_v2)
  await db_session.commit()

  # Checks
  result = await db_session.execute(select(WidgetTemplate).where(WidgetTemplate.title == item["title"]))
  rows = result.scalars().all()

  assert len(rows) == 1
  assert rows[0].description == "Updated Description for Test"
