"""
AI API Router.

This module exposes endpoints for AI-assisted features, primarily the conversion
of Natural Language prompts into executable SQL queries compatible with the
internal DuckDB schema.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api import deps
from app.models.user import User
from app.schemas.ai import SQLGenerationRequest, SQLGenerationResponse
from app.services.sql_generator import sql_generator

router = APIRouter()


@router.post("/generate", response_model=SQLGenerationResponse)
async def generate_sql_query(
  request: SQLGenerationRequest,
  current_user: Annotated[User, Depends(deps.get_current_user)],
) -> SQLGenerationResponse:
  """
  Generates a SQL query based on a natural language prompt.

  This endpoint uses the registered LLM service to interpret the user's intent
  against the current database schema.

  Args:
      request (SQLGenerationRequest): The payload containing the natural language prompt.
      current_user (User): The authenticated user (required to access this feature).

  Returns:
      SQLGenerationResponse: The generated SQL query string.

  Raises:
      HTTPException:
          - 400: If the prompt is empty.
          - 503: If the LLM service is unavailable or times out.
  """
  if not request.prompt.strip():
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Prompt cannot be empty.",
    )

  try:
    generated_sql = await sql_generator.generate_sql(request.prompt)
    return SQLGenerationResponse(sql=generated_sql)
  except TimeoutError:
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail="The AI assistant timed out. Please try again later.",
    )
  except Exception as e:
    # Log the actual error internally in a real app
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail=f"AI Generation failed: {str(e)}",
    )
