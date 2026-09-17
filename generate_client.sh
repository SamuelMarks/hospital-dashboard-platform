#!/usr/bin/env bash

# -----------------------------------------------------------------------------
# Script: generate_client.sh
# Description: Generates both the Angular TypeScript client and Kotlin
#              Multiplatform (KMP) client from the Backend OpenAPI schema.
# Requirements:
#   - Python 3 with backend dependencies installed (uv).
#   - Node.js & npm (to run @openapitools/openapi-generator-cli).
# -----------------------------------------------------------------------------

set -e # Exit immediately if a command exits with a non-zero status.

# Paths
BACKEND_DIR="./pulse-query-backend"
FRONTEND_DEST="./pulse-query-ng-web/src/app/api-client"
KMP_DEST="./PulseQuery/composeApp/src/commonMain/kotlin/io/healthplatform/pulsequery/api"
SCHEMA_FILE="./openapi.json"
TMP_KMP_DIR="/tmp/kmp_client_gen"

# Cache configurations for resilient execution
export UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/uv_cache}"
export npm_config_cache="${npm_config_cache:-/tmp/npm_cache}"

echo "=================================================="
echo "🚀 Starting Full-Stack Client Generation Process"
echo "=================================================="

# 1. Extract Schema
echo ""
echo "🔹 Step 1: Extracting OpenAPI JSON from Backend..."
cd $BACKEND_DIR
uv run python scripts/extract_openapi.py --output ../$SCHEMA_FILE
cd ..

if [ ! -f "$SCHEMA_FILE" ]; then
    echo "❌ Error: openapi.json was not generated."
    exit 1
fi

# 1a. Validate Critical Types Exist
for critical_type in "ScenarioConstraint" "SystemHealthResponse" "SystemDiagnosticsResponse" "ReingestResponse" "DashboardShareResponse"; do
    if ! grep -q "$critical_type" "$SCHEMA_FILE"; then
        echo "❌ Error: Schema is missing critical type '$critical_type'."
        exit 1
    fi
done

# 2. Clean Previous Angular Client
echo ""
echo "🔹 Step 2: Cleaning old Angular client files..."
if [ -d "$FRONTEND_DEST" ]; then
    rm -rf "$FRONTEND_DEST"
    echo "   - Removed $FRONTEND_DEST"
fi
mkdir -p "$FRONTEND_DEST"

# 3. Generate Angular Client
echo ""
echo "🔹 Step 3: Generating Angular TypeScript Client..."

if ! command -v npx &> /dev/null; then
    echo "❌ Error: 'npx' is not installed. Please install Node.js."
    exit 1
fi

npx -y @openapitools/openapi-generator-cli generate \
    -i "$SCHEMA_FILE" \
    -g typescript-angular \
    -o "$FRONTEND_DEST" \
    --additional-properties=ngVersion=17.0.0,fileNaming=kebab-case \
    --skip-validate-spec

# Fix empty any/object types in TypeScript client
sed -i '' 's/?:  | null/?: Record<string, any> | null/g' "$FRONTEND_DEST/model/"*.ts 2>/dev/null || true
sed -i '' 's/?: | null/?: Record<string, any> | null/g' "$FRONTEND_DEST/model/"*.ts 2>/dev/null || true

# 4. Generate Kotlin Multiplatform Client
echo ""
echo "🔹 Step 4: Generating Kotlin Multiplatform (KMP) Client..."

rm -rf "$TMP_KMP_DIR"
mkdir -p "$TMP_KMP_DIR"

npx -y @openapitools/openapi-generator-cli generate \
    -i "$SCHEMA_FILE" \
    -g kotlin \
    --library multiplatform \
    -o "$TMP_KMP_DIR" \
    --additional-properties=packageName=io.healthplatform.pulsequery.api,collectionType=list,dateLibrary=kotlinx-datetime \
    --skip-validate-spec

# Copy generated apis and models into KMP source tree
mkdir -p "$KMP_DEST/apis"
mkdir -p "$KMP_DEST/models"
mkdir -p "$KMP_DEST/infrastructure"

cp -r "$TMP_KMP_DIR/src/commonMain/kotlin/io/healthplatform/pulsequery/api/apis/"* "$KMP_DEST/apis/"
cp -r "$TMP_KMP_DIR/src/commonMain/kotlin/io/healthplatform/pulsequery/api/models/"* "$KMP_DEST/models/"
cp -r "$TMP_KMP_DIR/src/commonMain/kotlin/io/healthplatform/pulsequery/api/infrastructure/"* "$KMP_DEST/infrastructure/"

# Ensure polymorphic WidgetIn definition is restored if overwritten by raw generator
cat << 'EOF' > "$KMP_DEST/models/WidgetIn.kt"
package io.healthplatform.pulsequery.api.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Polymorphic base model for creating widgets.
 */
@Serializable
sealed class WidgetIn {
    /** The title of the widget. */
    abstract val title: String
    /** The widget type identifier (e.g., SQL, TEXT, HTTP). */
    abstract val type: String
    /** The visualization format (e.g., table, bar_chart). */
    abstract val visualization: String

    /**
     * Payload for creating a SQL widget.
     */
    @Serializable
    @SerialName("SQL")
    data class Sql(
        override val title: String,
        override val type: String = "SQL",
        override val visualization: String = "table",
        val config: SqlConfig
    ) : WidgetIn()

    /**
     * Payload for creating a text widget.
     */
    @Serializable
    @SerialName("TEXT")
    data class Text(
        override val title: String,
        override val type: String = "TEXT",
        override val visualization: String = "markdown",
        val config: TextConfig
    ) : WidgetIn()

    /**
     * Payload for creating an HTTP widget.
     */
    @Serializable
    @SerialName("HTTP")
    data class Http(
        override val title: String,
        override val type: String = "HTTP",
        override val visualization: String = "table",
        val config: HttpConfig
    ) : WidgetIn()
}
EOF

# Ensure SystemDiagnosticsResponse uses JsonElement for environmentChecks
sed -i '' 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlin.collections.Map<kotlin.String, kotlinx.serialization.json.JsonElement>/g' "$KMP_DEST/models/SystemDiagnosticsResponse.kt" 2>/dev/null || true

# Fix raw untyped Map in models to JsonObject / JsonElement
sed -i '' 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlinx.serialization.json.JsonObject/g' "$KMP_DEST/models/WidgetResponse.kt" 2>/dev/null || true
sed -i '' 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlinx.serialization.json.JsonObject/g' "$KMP_DEST/models/WidgetUpdate.kt" 2>/dev/null || true
sed -i '' 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlinx.serialization.json.JsonObject/g' "$KMP_DEST/models/SQLExecutionRequest.kt" 2>/dev/null || true
sed -i '' 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlinx.serialization.json.JsonObject/g' "$KMP_DEST/models/SQLExecutionResponse.kt" 2>/dev/null || true
sed -i '' 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlinx.serialization.json.JsonObject/g' "$KMP_DEST/models/TemplateCreate.kt" 2>/dev/null || true
sed -i '' 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlinx.serialization.json.JsonObject/g' "$KMP_DEST/models/TemplateResponse.kt" 2>/dev/null || true
sed -i '' 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlinx.serialization.json.JsonObject/g' "$KMP_DEST/models/TemplateUpdate.kt" 2>/dev/null || true
sed -i '' 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlin.collections.Map<kotlin.String, kotlinx.serialization.json.JsonElement>/g' "$KMP_DEST/models/AdminSettingsResponse.kt" 2>/dev/null || true
sed -i '' 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlin.collections.Map<kotlin.String, kotlinx.serialization.json.JsonElement>/g' "$KMP_DEST/models/AdminSettingsUpdateRequest.kt" 2>/dev/null || true
sed -i '' 's/@SerialName(value = "language_preference") @Required val languagePreference: kotlin\.String,/@SerialName(value = "language_preference") val languagePreference: kotlin.String = "en",/g' "$KMP_DEST/models/UserResponse.kt" 2>/dev/null || true

# Fix ExecutionApi refreshDashboard requestBody and JsonElement types
sed -i '' 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlin.collections.Map<kotlin.String, kotlinx.serialization.json.JsonElement>/g' "$KMP_DEST/apis/ExecutionApi.kt" 2>/dev/null || true
sed -i '' 's/Map<kotlin\.String, kotlin\.Any>/Map<kotlin.String, kotlinx.serialization.json.JsonElement>/g' "$KMP_DEST/apis/ExecutionApi.kt" 2>/dev/null || true
sed -i '' 's/RefreshDashboardApiV1DashboardsDashboardIdRefreshPostRequest(requestBody)/requestBody ?: emptyMap<String, kotlinx.serialization.json.JsonElement>()/g' "$KMP_DEST/apis/ExecutionApi.kt" 2>/dev/null || true
sed -i '' 's/serializer<Map<String, kotlin\.Any>>()/serializer<Map<String, kotlinx.serialization.json.JsonElement>>()/g' "$KMP_DEST/apis/ExecutionApi.kt" 2>/dev/null || true

# Fix raw untyped Map in BenchmarksApi
sed -i '' 's/List<kotlin\.collections\.Map>/List<kotlin.collections.Map<kotlin.String, kotlinx.serialization.json.JsonElement>>/g' "$KMP_DEST/apis/BenchmarksApi.kt" 2>/dev/null || true

# Fix AnyOfLessThanGreaterThan in models
find "$KMP_DEST/models" -name "*.kt" -exec sed -i '' 's/import io\.healthplatform\.pulsequery\.api\.models\.AnyOfLessThanGreaterThan//g' {} + 2>/dev/null || true
find "$KMP_DEST/models" -name "*.kt" -exec sed -i '' 's/AnyOfLessThanGreaterThan/kotlinx.serialization.json.JsonElement/g' {} + 2>/dev/null || true

rm -rf "$TMP_KMP_DIR"

# 5. Cleanup
echo ""
echo "🔹 Step 5: Cleanup..."
rm "$SCHEMA_FILE"
echo "   - Removed temporary $SCHEMA_FILE"

echo ""
echo "=================================================="
echo "✅ Full-Stack Client Generation Complete!"
echo "📂 Angular Client: $FRONTEND_DEST"
echo "📂 KMP Client:     $KMP_DEST"
echo "=================================================="