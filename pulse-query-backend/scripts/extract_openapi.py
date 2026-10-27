"""
OpenAPI Extraction Utilities.

This script imports the FastAPI application instance and exports its
OpenAPI (Swagger) specification to a JSON file. This allows client generation
tools to build the frontend SDK without requiring the backend server to be
running actively on a specific port.
"""

import argparse
import json
import os

from app.main import app
from app.schemas.json_types import JsonObject


def extract_openapi(output_path: str) -> None:
  """
  Extracts the OpenAPI schema from the FastAPI app and writes it to a file.

  It retrieves the raw dictionary from FastAPI's `.openapi()` method and
  serializes it to JSON format.

  Args:
      output_path (str): The relative or absolute path where the JSON
          file should be saved.
  """
  print("🔍 Extracting OpenAPI schema from FastAPI app...")

  # Get the raw schema dictionary
  openapi_data: JsonObject = app.openapi()

  # Ensure directory exists
  output_dir = os.path.dirname(output_path)
  if output_dir and not os.path.exists(output_dir):
    os.makedirs(output_dir)

  with open(output_path, "w", encoding="utf-8") as f:
    json.dump(openapi_data, f, indent=2)

  print(f"✅ OpenAPI schema saved to: {output_path}")


def main(argv: list[str] | None = None) -> None:
  """
  CLI entry point for extracting the FastAPI OpenAPI schema to disk.

  Args:
      argv (list[str] | None): Optional command-line argument list.
  """
  parser = argparse.ArgumentParser(description="Extract OpenAPI Schema")
  parser.add_argument(
    "--output",
    type=str,
    default="openapi.json",
    help="Path to save the generated JSON file.",
  )
  args = parser.parse_args(argv)
  extract_openapi(args.output)


if __name__ == "__main__":
  main()
