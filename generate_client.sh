#!/bin/sh
# # generate_client.sh
#
# ## Overview
# Generates both the Angular TypeScript client and Kotlin Multiplatform (KMP)
# client from the Backend OpenAPI schema using POSIX /bin/sh.
#
# ## Usage
# ./generate_client.sh

set -feu

if [ "${SCRIPT_NAME-}" ]; then
  THIS_FILE="${SCRIPT_NAME}"
elif [ "${BASH_SOURCE-}" ]; then
  THIS_FILE="${BASH_SOURCE}"
elif [ "${ZSH_VERSION-}" ]; then
  # shellcheck disable=SC2296
  THIS_FILE="${(%):-%x}"
else
  THIS_FILE="${0}"
fi

case "${STACK+x}" in
  *':'"${THIS_FILE}"':'*)
    printf '[STOP]     processing "%s"\n' "${THIS_FILE}" >&2
    if (return 0 2>/dev/null); then return; else exit 0; fi ;;
  *) printf '[CONTINUE] processing "%s"\n' "${THIS_FILE}" >&2 ;;
esac
export STACK="${STACK:-}${THIS_FILE}"':'
SCRIPT_DIR=$(cd -- "$(dirname -- "${THIS_FILE}")" && pwd)
: "${LIBSCRIPT_ROOT_DIR:=$(d="$SCRIPT_DIR"; while [ ! -f "$d/libscript.sh" ]; do n="${d%/*}"; [ -z "$n" ] && n="/"; [ "$d" = "$n" ] && break; d="$n"; done; printf '%s\n' "$d")}"

# ## sed_inplace
# Applies a portable sed replacement to a target file across BSD/macOS and GNU sed.
sed_inplace() {
  _si_expr="$1"
  _si_file="$2"
  [ -f "$_si_file" ] || return 0
  _si_tmp="${_si_file}.tmp.$$"
  if sed "$_si_expr" "$_si_file" > "$_si_tmp" 2>/dev/null; then
    mv "$_si_tmp" "$_si_file"
  else
    rm -f "$_si_tmp"
  fi
}

BACKEND_DIR="${SCRIPT_DIR}/pulse-query-backend"
FRONTEND_DEST="${SCRIPT_DIR}/pulse-query-ng-web/src/app/api-client"
KMP_DEST="${SCRIPT_DIR}/PulseQuery/composeApp/src/commonMain/kotlin/io/healthplatform/pulsequery/api"
SCHEMA_FILE="${SCRIPT_DIR}/openapi.json"
TMP_KMP_DIR="${SCRIPT_DIR}/.tmp_kmp_client_gen"

export UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/uv_cache}"
export npm_config_cache="${npm_config_cache:-/tmp/npm_cache}"

printf '%s\n' '=================================================='
printf '%s\n' 'Starting Full-Stack Client Generation Process'
printf '%s\n' '=================================================='

printf '\n%s\n' 'Step 1: Extracting OpenAPI JSON from Backend...'
(
  cd "$BACKEND_DIR"
  uv run python scripts/extract_openapi.py --output "$SCHEMA_FILE"
)

if [ ! -f "$SCHEMA_FILE" ]; then
  printf '%s\n' 'Error: openapi.json was not generated.' >&2
  exit 1
fi

for critical_type in "ServiceUnitConstraint" "OptimizationSolutionPayload" "SystemHealthResponse" "SystemDiagnosticsResponse" "ReingestResponse" "DashboardShareResponse"; do
  if ! grep -q "$critical_type" "$SCHEMA_FILE"; then
    printf '%s\n' "Error: Schema is missing critical type '$critical_type'." >&2
    exit 1
  fi
done

printf '\n%s\n' 'Step 2: Cleaning old Angular client files...'
if [ -d "$FRONTEND_DEST" ]; then
  rm -rf "$FRONTEND_DEST"
fi
mkdir -p "$FRONTEND_DEST"

printf '\n%s\n' 'Step 3: Generating Angular TypeScript Client...'
if ! command -v npx >/dev/null 2>&1; then
  printf '%s\n' "Error: 'npx' is not installed. Please install Node.js." >&2
  exit 1
fi

npx -y @openapitools/openapi-generator-cli generate \
  -i "$SCHEMA_FILE" \
  -g typescript-angular \
  -o "$FRONTEND_DEST" \
  --additional-properties=ngVersion=17.0.0,fileNaming=kebab-case \
  --skip-validate-spec

set +f
for _ts_f in "$FRONTEND_DEST/model/"*.ts; do
  [ -f "$_ts_f" ] || continue
  sed_inplace 's/?:  | null/?: Record<string, any> | null/g' "$_ts_f"
  sed_inplace 's/?: | null/?: Record<string, any> | null/g' "$_ts_f"
done
set -f

printf '\n%s\n' 'Step 4: Generating Kotlin Multiplatform (KMP) Client...'
rm -rf "$TMP_KMP_DIR"
mkdir -p "$TMP_KMP_DIR"

npx -y @openapitools/openapi-generator-cli generate \
  -i "$SCHEMA_FILE" \
  -g kotlin \
  --library multiplatform \
  -o "$TMP_KMP_DIR" \
  --additional-properties=packageName=io.healthplatform.pulsequery.api,collectionType=list,dateLibrary=kotlinx-datetime \
  --skip-validate-spec

rm -rf "$KMP_DEST/apis" "$KMP_DEST/models"
mkdir -p "$KMP_DEST/apis"
mkdir -p "$KMP_DEST/models"
mkdir -p "$KMP_DEST/infrastructure"

cp -r "$TMP_KMP_DIR/src/commonMain/kotlin/io/healthplatform/pulsequery/api/apis/." "$KMP_DEST/apis/"
cp -r "$TMP_KMP_DIR/src/commonMain/kotlin/io/healthplatform/pulsequery/api/models/." "$KMP_DEST/models/"
cp -r "$TMP_KMP_DIR/src/commonMain/kotlin/io/healthplatform/pulsequery/api/infrastructure/." "$KMP_DEST/infrastructure/"

cat << 'EOF' > "$KMP_DEST/models/WidgetIn.kt"
/**
 * Polymorphic widget creation payload models (`SQL`, `HTTP`, `TEXT`).
 */
package io.healthplatform.pulsequery.api.models

import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonContentPolymorphicSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Content-based polymorphic serializer for [WidgetIn] dispatching on the `"type"` JSON property.
 */
object WidgetInSerializer : JsonContentPolymorphicSerializer<WidgetIn>(WidgetIn::class) {
    /**
     * Selects the concrete [DeserializationStrategy] based on the `"type"` field in [element].
     *
     * @param element Parsed JSON payload.
     * @return Concrete [WidgetIn] subtype serializer.
     */
    override fun selectDeserializer(element: JsonElement): DeserializationStrategy<WidgetIn> {
        val typeElement = element.jsonObject["type"] ?: return WidgetIn.Sql.serializer()
        return when (typeElement.jsonPrimitive.content.uppercase()) {
            "TEXT" -> WidgetIn.Text.serializer()
            "HTTP" -> WidgetIn.Http.serializer()
            else -> WidgetIn.Sql.serializer()
        }
    }
}

/**
 * Polymorphic base model for creating dashboard widgets.
 */
@Serializable(with = WidgetInSerializer::class)
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

sed_inplace 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlin.collections.Map<kotlin.String, kotlinx.serialization.json.JsonElement>/g' "$KMP_DEST/models/SystemDiagnosticsResponse.kt"
sed_inplace 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlinx.serialization.json.JsonObject/g' "$KMP_DEST/models/WidgetResponse.kt"
sed_inplace 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlinx.serialization.json.JsonObject/g' "$KMP_DEST/models/WidgetUpdate.kt"
sed_inplace 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlinx.serialization.json.JsonObject/g' "$KMP_DEST/models/SQLExecutionRequest.kt"
sed_inplace 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlinx.serialization.json.JsonObject/g' "$KMP_DEST/models/SQLExecutionResponse.kt"
sed_inplace 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlinx.serialization.json.JsonObject/g' "$KMP_DEST/models/TemplateCreate.kt"
sed_inplace 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlinx.serialization.json.JsonObject/g' "$KMP_DEST/models/TemplateResponse.kt"
sed_inplace 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlinx.serialization.json.JsonObject/g' "$KMP_DEST/models/TemplateUpdate.kt"
sed_inplace 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlin.collections.Map<kotlin.String, kotlinx.serialization.json.JsonElement>/g' "$KMP_DEST/models/AdminSettingsResponse.kt"
sed_inplace 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlin.collections.Map<kotlin.String, kotlinx.serialization.json.JsonElement>/g' "$KMP_DEST/models/AdminSettingsUpdateRequest.kt"
sed_inplace 's/@SerialName(value = "language_preference") @Required val languagePreference: kotlin\.String,/@SerialName(value = "language_preference") val languagePreference: kotlin.String = "en",/g' "$KMP_DEST/models/UserResponse.kt"

sed_inplace 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlin.collections.Map<kotlin.String, kotlinx.serialization.json.JsonElement>/g' "$KMP_DEST/apis/ExecutionApi.kt"
sed_inplace 's/Map<kotlin\.String, kotlin\.Any>/Map<kotlin.String, kotlinx.serialization.json.JsonElement>/g' "$KMP_DEST/apis/ExecutionApi.kt"
sed_inplace 's/RefreshDashboardApiV1DashboardsDashboardIdRefreshPostRequest(requestBody)/requestBody ?: emptyMap<String, kotlinx.serialization.json.JsonElement>()/g' "$KMP_DEST/apis/ExecutionApi.kt"
sed_inplace 's/serializer<Map<String, kotlin\.Any>>()/serializer<Map<String, kotlinx.serialization.json.JsonElement>>()/g' "$KMP_DEST/apis/ExecutionApi.kt"
sed_inplace 's/List<kotlin\.collections\.Map>/List<kotlin.collections.Map<kotlin.String, kotlinx.serialization.json.JsonElement>>/g' "$KMP_DEST/apis/BenchmarksApi.kt"

set +f
for _kt_f in "$KMP_DEST/models/"*.kt; do
  [ -f "$_kt_f" ] || continue
  sed_inplace 's/import io\.healthplatform\.pulsequery\.api\.models\.AnyOfLessThanGreaterThan//g' "$_kt_f"
  sed_inplace 's/AnyOfLessThanGreaterThan/kotlinx.serialization.json.JsonElement/g' "$_kt_f"
  sed_inplace 's/kotlin\.collections\.Map<kotlin\.String, kotlin\.Any>/kotlinx.serialization.json.JsonObject/g' "$_kt_f"
done
set -f

rm -rf "$TMP_KMP_DIR"

if [ -x "$BACKEND_DIR/.venv/bin/python" ]; then
  "$BACKEND_DIR/.venv/bin/python" "$SCRIPT_DIR/scripts/normalize_api_client.py"
else
  python3 "$SCRIPT_DIR/scripts/normalize_api_client.py"
fi

rm -f "$SCHEMA_FILE"

printf '\n%s\n' '=================================================='
printf '%s\n' 'Full-Stack Client Generation Complete!'
printf '%s\n' "Angular Client: $FRONTEND_DEST"
printf '%s\n' "KMP Client:     $KMP_DEST"
printf '%s\n' '=================================================='
