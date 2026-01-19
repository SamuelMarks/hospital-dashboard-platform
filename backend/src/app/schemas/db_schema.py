"""
Database Schema Models.

Defines Pydantic models for representing the analytical database structure
(Tables and Columns). Used by the Schema API to support frontend IntelliSense.
"""

from typing import List
from pydantic import BaseModel, ConfigDict


class ColumnInfo(BaseModel):
  """
  Metadata for a single database column.
  """

  name: str
  type: str

  model_config = ConfigDict(from_attributes=True)


class TableInfo(BaseModel):
  """
  Metadata for a database table, including its columns.
  """

  table_name: str
  columns: List[ColumnInfo]

  model_config = ConfigDict(from_attributes=True)
