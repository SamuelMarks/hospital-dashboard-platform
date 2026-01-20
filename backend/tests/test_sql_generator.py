import pytest
from unittest.mock import AsyncMock, patch
from app.services.sql_generator import sql_generator


def test_sql_cleaning_logic():
  """
  Test that the service correctly strips Markdown formatting
  often returned by LLMs (e.g. ```sql ... ```).

  Synchronous Unit Test.
  """
  # Case 1: Pure SQL response
  raw_1 = "SELECT * FROM hospital_data LIMIT 10;"
  assert sql_generator._clean_sql_response(raw_1) == raw_1

  # Case 2: Markdown wrapped
  raw_2 = """```sql
    SELECT count(*) FROM hospital_data;
    ```"""
  cleaned_2 = sql_generator._clean_sql_response(raw_2)
  assert cleaned_2 == "SELECT count(*) FROM hospital_data;"

  # Case 3: Markdown with text description (Edge case)
  raw_3 = """Here is the query:
    ```
    SELECT avg(billing_amount) FROM hospital_data;
    ```
    """
  cleaned_3 = sql_generator._clean_sql_response(raw_3)
  assert cleaned_3 == "SELECT avg(billing_amount) FROM hospital_data;"


def test_process_global_filters_injection():
  """
  Verify that global params are injected correctly into SQL placeholders.
  """
  # Setup
  raw_sql = """
        SELECT * FROM t
        WHERE 1=1
        {{global_service}}
        {{global_date_range}}
    """
  params = {"dept": "Cardiology", "start_date": "2023-01-01", "end_date": "2023-01-31"}

  # Action
  processed = sql_generator.process_global_filters(raw_sql, params)

  # Asset
  assert "AND Clinical_Service = 'Cardiology'" in processed
  assert "AND Midnight_Census_DateTime BETWEEN '2023-01-01' AND '2023-01-31'" in processed
  assert "{{global_service}}" not in processed


def test_process_global_filters_date_spine_injection():
  """
  Verify that explicit start/end dates are injected for GENERATE_DATES macros.
  """
  raw_sql = "SELECT * FROM GENERATE_DATES('{{global_start_date}}', '{{global_end_date}}')"
  params = {"start_date": "2024-01-01", "end_date": "2024-02-01"}

  processed = sql_generator.process_global_filters(raw_sql, params)

  assert "GENERATE_DATES('2024-01-01', '2024-02-01')" in processed


def test_process_global_filters_defaults():
  """
  Verify defaults are used when keys are missing.
  """
  raw_sql = "SELECT * FROM GENERATE_DATES('{{global_start_date}}', '{{global_end_date}}')"
  params = {}  # Empty

  processed = sql_generator.process_global_filters(raw_sql, params)

  # Defaults defined in service
  assert "2023-01-01" in processed
  assert "2023-12-31" in processed


@pytest.mark.asyncio
async def test_generation_flow_mocked():
  """
  Simulate a full flow using a mock for the actual HTTP call.
  Async test using asyncio.
  """
  mock_sql = "SELECT department, COUNT(*) FROM hospital_data GROUP BY department"

  # We patch the 'generate_response' method of the llm_client instance imported inside sql_generator
  with patch("app.services.sql_generator.llm_client.generate_response", new_callable=AsyncMock) as mock_llm:
    mock_llm.return_value = f"```sql\n{mock_sql}\n```"

    result = await sql_generator.generate_sql("How many visits per department?")

    # Verify result
    assert result == mock_sql

    # Verify the prompt contained the schema AND the new sparse instructions
    call_args = mock_llm.call_args[1]  # kwargs
    messages = call_args["messages"]
    system_content = messages[0]["content"]  # System prompt is index 0
    user_content = messages[1]["content"]

    assert "Database Schema" in user_content
    assert "hospital_data" in user_content

    # Verify Sparse Handling instructions are present
    assert "GENERATE_DATES" in system_content
    assert "sparse data" in system_content
    assert "LEFT JOIN" in system_content
