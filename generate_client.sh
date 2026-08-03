#!/usr/bin/env bash

# -----------------------------------------------------------------------------
# Script: generate_client.sh
# Description: Generates the Angular TypeScript client from the Backend API.
# Requirements:
#   - Python 3 with backend dependencies installed (uv).
#   - Node.js & npm (to run @openapitools/openapi-generator-cli).
# -----------------------------------------------------------------------------

set -e # Exit immediately if a command exits with a non-zero status.

# Paths
BACKEND_DIR="./pulse-query-backend"
# Updated path to match your new Angular project name
FRONTEND_DEST="./pulse-query-ng-web/src/app/api-client"
SCHEMA_FILE="./openapi.json"

echo "=================================================="
echo "🚀 Starting Client Generation Process"
echo "=================================================="

# 1. Extract Schema
echo ""
echo "🔹 Step 1: Extracting OpenAPI JSON from Backend..."
cd $BACKEND_DIR
# Run the python script via uv to ensure environment variables/deps are loaded
uv run python scripts/extract_openapi.py --output ../$SCHEMA_FILE
cd ..

# Check if file was created
if [ ! -f "$SCHEMA_FILE" ]; then
    echo "❌ Error: openapi.json was not generated."
    exit 1
fi

# 1a. Validate Critical Types Exist (Pydantic Sync Check)
# We grep for specific nested models to ensure recursion worked during export
if ! grep -q "ScenarioConstraint" "$SCHEMA_FILE"; then
    echo "❌ Error: Schema is missing critical type 'ScenarioConstraint'."
    echo "   Ensure backend Pydantic models are correctly exported/referenced in the Router."
    exit 1
fi

# 2. Clean Previous Client
echo ""
echo "🔹 Step 2: Cleaning old client files..."
if [ -d "$FRONTEND_DEST" ]; then
    rm -rf "$FRONTEND_DEST"
    echo "   - Removed $FRONTEND_DEST"
fi
mkdir -p "$FRONTEND_DEST"

# 3. Generate Angular Client
# We use 'npx' to execute the generator without global installation.
# generator-name: typescript-angular
# additional-properties: ngVersion=17 (ensures compatibility with standalone/provideHttpClient)
echo ""
echo "🔹 Step 3: Generating Angular Client..."

# Ensure npx is available
if ! command -v npx &> /dev/null; then
    echo "❌ Error: 'npx' is not installed. Please install Node.js."
    exit 1
fi

npx @openapitools/openapi-generator-cli generate \
    -i "$SCHEMA_FILE" \
    -g typescript-angular \
    -o "$FRONTEND_DEST" \
    --additional-properties=ngVersion=17.0.0,fileNaming=kebab-case \
    --skip-validate-spec

# 4. Cleanup
echo ""
echo "🔹 Step 4: Cleanup..."
rm "$SCHEMA_FILE"
echo "   - Removed temporary $SCHEMA_FILE"

echo ""
echo "=================================================="
echo "✅ Client Generation Complete!"
echo "📂 Location: $FRONTEND_DEST"
echo "=================================================="