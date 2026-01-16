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

    # Verify the prompt contained the schema
    call_args = mock_llm.call_args[1]  # kwargs
    messages = call_args["messages"]
    user_content = messages[1]["content"]

    assert "Database Schema" in user_content
    # The default ingestion created 'hospital_data', not 'hospital_visits'
    assert "hospital_data" in user_content
