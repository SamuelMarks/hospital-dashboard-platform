"""
Unit tests for root `scripts/normalize_api_client.py` OpenAPI client normalizer.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys

ROOT_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "normalize_api_client.py"
spec = importlib.util.spec_from_file_location("root_normalize_api_client", ROOT_SCRIPT)
assert spec is not None
assert spec.loader is not None
normalize_api_client = importlib.util.module_from_spec(spec)
sys.modules["root_normalize_api_client"] = normalize_api_client
spec.loader.exec_module(normalize_api_client)


def test_array_and_indexed_object_normalization() -> None:
  """Verifies `_replace_array_syntax` and `_normalize_indexed_objects` handle nested generics and unbalanced input."""
  assert normalize_api_client._find_matching_angle("Array<string", 6) == -1
  assert normalize_api_client._replace_array_syntax("Array<string") == "Array<string"
  assert normalize_api_client._replace_array_syntax("Array<Array<string | number>>") == "((string | number)[])[]"
  assert (
    normalize_api_client._normalize_indexed_objects("{ [key: string]: { [key: string]: any } } | Record<string, any>")
    == "Record<string, Record<string, unknown>> | Record<string, unknown>"
  )


def test_normalize_model_and_service_files(tmp_path: Path) -> None:
  """Verifies `normalize_model_file`, `normalize_service_file`, `normalize_angular_client`, and `normalize_kmp_client`."""
  nl = chr(10)
  client_dir = tmp_path / "api-client"
  model_dir = client_dir / "model"
  api_dir = client_dir / "api"
  model_dir.mkdir(parents=True)
  api_dir.mkdir(parents=True)

  (client_dir / "index.ts").write_text(f"export * from './api/api';{nl}", encoding="utf-8")
  (model_dir / "models.ts").write_text(f"export * from './sample';{nl}", encoding="utf-8")
  (api_dir / "api.ts").write_text(f"export * from './sample.service';{nl}", encoding="utf-8")

  # Model file with Hospital Analytics Platform header, unused import, undocumented interface/type/prop, and ValidationErrorLocInner
  sample_model = model_dir / "sample.ts"
  sample_model.write_text(
    f"/**{nl} * Hospital Analytics Platform{nl} */{nl}"
    f"// @ts-ignore{nl}"
    f"import {{ UnusedType }} from './unused';{nl}"
    f"import {{ UsedType }} from './used';{nl}"
    f"export interface SampleModel {{{nl}"
    f"  /** Documented prop */{nl}"
    f"  used: UsedType;{nl}"
    f"  undoc?: Array<{{ [key: string]: any }}>;{nl}"
    f"}}{nl}"
    f"export namespace SampleModel {{}}{nl}"
    f"export type SampleAlias = string;{nl}"
    f"/** Already documented type */{nl}"
    f"export const SAMPLE_CONST = 1;{nl}"
    f"export interface ValidationErrorLocInner {{}}{nl}",
    encoding="utf-8",
  )

  # dashboard-response.ts model file to exercise widgets?: WidgetResponse[] normalization
  dash_model = model_dir / "dashboard-response.ts"
  dash_model.write_text(
    f"/** Doc interface */{nl}export interface DashboardResponse {{{nl}  widgets?: WidgetResponse[];{nl}}}{nl}",
    encoding="utf-8",
  )

  # Model file without any header comment
  bare_model = model_dir / "bare.ts"
  bare_model.write_text(
    f"/** Doc interface */{nl}export interface BareModel {{{nl}  x: number;{nl}}}{nl}",
    encoding="utf-8",
  )

  # Service file with constructor, tslint comment, @endpoint JSDoc, form params, and unused imports
  sample_service = api_dir / "sample.service.ts"
  sample_service.write_text(
    f"/**{nl} * Hospital Analytics Platform{nl} */{nl}"
    f"/* tslint:disable:no-unused-variable member-ordering */{nl}"
    f"// @ts-ignore{nl}"
    f"import {{ Inject, Injectable, Optional }} from '@angular/core';{nl}"
    f"import {{{nl}  HttpClient,{nl}  HttpHeaders,{nl}  HttpParams,{nl}  HttpResponse,{nl}  HttpEvent,{nl}}} from '@angular/common/http';{nl}"
    f"import {{ Observable }} from 'rxjs';{nl}"
    f"import {{ HTTPValidationError }} from '../model/http-validation-error';{nl}"
    f"import {{ BASE_PATH, COLLECTION_FORMATS }} from '../variables';{nl}"
    f"import {{ Configuration }} from '../configuration';{nl}"
    f"import {{ BaseService }} from '../api.base.service';{nl}"
    f"import {{ OpenApiHttpParams, QueryParamStyle }} from '../query.params';{nl}"
    f"@Injectable({{{nl}  providedIn: 'root',{nl}}}){nl}"
    f"export class SampleService extends BaseService {{{nl}"
    f"  constructor(protected httpClient: HttpClient, @Optional() @Inject(BASE_PATH) basePath: string | string[], @Optional() configuration?: Configuration) {{ super(basePath, configuration); }}{nl}"
    f"  /**{nl}   * Summary{nl}   * @endpoint post /api/v1/test{nl}   * @param id{nl}   * @param body Named body{nl}   */{nl}"
    f"  public doPost(id: string, observe: any = 'body', reportProgress: boolean = false): Observable<any> {{{nl}"
    f"    const canConsumeForm = this.canConsumeForm(consumes);{nl}"
    f"    let localVarFormParams: {{ append(param: string, value: any): any }};{nl}"
    f"    localVarFormParams = (localVarFormParams.append('id', <any>id) as any) || localVarFormParams;{nl}"
    f"    return this.httpClient.request<any>(   'post', '/test', {{ observe: <any>observe }});{nl}"
    f"  }}{nl}"
    f"  /**{nl}   * Already has returns{nl}   * @endpoint get /api/v1/test{nl}   * @returns Existing return doc.{nl}   */{nl}"
    f"  public doGet(): Observable<unknown> {{{nl}"
    f"    return this.httpClient.request<string>('get', '/test', {{}});{nl}"
    f"  }}{nl}"
    f"}}{nl}",
    encoding="utf-8",
  )

  # Service file that uses OpenApiHttpParams without importing query.params, and has an unbalanced request<
  query_service = api_dir / "query.service.ts"
  query_service.write_text(
    f"import {{ BaseService }} from '../api.base.service';{nl}"
    f"/**{nl} * Injectable OpenAPI client service.{nl} */{nl}"
    f"@Injectable({{ providedIn: 'root' }}){nl}"
    f"export class QueryService extends BaseService {{{nl}"
    f"  public build(): OpenApiHttpParams {{{nl}"
    f"    const broken = 'this.httpClient.request<unclosed';{nl}"
    f"    return new OpenApiHttpParams();{nl}"
    f"  }}{nl}"
    f"}}{nl}",
    encoding="utf-8",
  )

  # Also test a service file that uses COLLECTION_FORMATS
  collection_service = api_dir / "collection.service.ts"
  collection_service.write_text(
    f"import {{ BASE_PATH, COLLECTION_FORMATS }} from '../variables';{nl}"
    f"@Injectable({{ providedIn: 'root' }}){nl}"
    f"export class CollectionService {{{nl}"
    f"  sep = COLLECTION_FORMATS.csv;{nl}"
    f"}}{nl}",
    encoding="utf-8",
  )

  # First pass normalizes everything
  normalize_api_client.normalize_angular_client(client_dir)
  # Second pass exercises idempotency branches (when @fileoverview and class JSDoc already exist)
  normalize_api_client.normalize_angular_client(client_dir)

  # Also test when index.ts, model/, and api/ do not exist
  empty_client = tmp_path / "empty-client"
  empty_client.mkdir(parents=True)
  normalize_api_client.normalize_angular_client(empty_client)

  normalized_model = sample_model.read_text(encoding="utf-8")
  assert "UnusedType" not in normalized_model
  assert "Record<string, unknown>[]" in normalized_model
  assert "export type ValidationErrorLocInner = string | number;" in normalized_model
  assert "widgets: WidgetResponse[];" in dash_model.read_text(encoding="utf-8")
  assert "from '../query.params'" in query_service.read_text(encoding="utf-8")

  normalized_service = sample_service.read_text(encoding="utf-8")
  assert "this.executeRequest<unknown>(this.httpClient," in normalized_service
  assert "this.appendFormParam(localVarFormParams, 'id', id);" in normalized_service
  assert "@param id Parameter `id`." in normalized_service
  assert "@returns Observable emitting the API response." in normalized_service

  # KMP client normalization: missing dir, models dir (with SqlScalar skip and enum/property normalization), and apis dir
  normalize_api_client.normalize_kmp_client(tmp_path / "nonexistent-kmp")
  kmp_root = tmp_path / "kmp"
  kmp_apis = kmp_root / "apis"
  kmp_models = kmp_root / "models"
  kmp_apis.mkdir(parents=True)
  kmp_models.mkdir(parents=True)

  # 1. Model file with SqlScalar (early return branch)
  scalar_kt = kmp_models / "SqlScalar.kt"
  scalar_kt.write_text(f"package sample{nl}typealias SqlScalar = String{nl}", encoding="utf-8")

  # 2. Model file with @file:Suppress, wildcard imports, @param, Values enum, undocumented enum entry, and documented enum entry
  model_kt = kmp_models / "ConstraintModel.kt"
  model_kt.write_text(
    f'@file:Suppress("UnusedImport"){nl}'
    f"package sample{nl}"
    f"import kotlinx.serialization.*{nl}"
    f"import kotlinx.serialization.descriptors.*{nl}"
    f"import kotlinx.serialization.encoding.*{nl}"
    f"/**{nl}"
    f" * Model doc{nl}"
    f" * @param `value`{nl}"
    f" * @param unit Target unit{nl}"
    f" */{nl}"
    f"@Serializable{nl}"
    f"data class ConstraintModel({nl}"
    f'    @SerialName(value = "value") val `value`: Double = (0.0).toDouble(),{nl}'
    f'    @SerialName(value = "unit") val unit: String{nl}'
    f") {{{nl}"
    f"    /**{nl}"
    f"     *{nl}"
    f"     * Values: ONE,TWO{nl}"
    f"     */{nl}"
    f"    @Serializable{nl}"
    f"    enum class Kind(val value: kotlin.String) {{{nl}"
    f'        @SerialName(value = "ONE") ONE("ONE"),{nl}'
    f"        /** Already documented */{nl}"
    f'        @SerialName(value = "TWO") TWO("TWO");{nl}'
    f"    }}{nl}"
    f"}} {nl}",
    encoding="utf-8",
  )

  # 3. API file without kotlinx.serialization.* or OptimizationApi (early return branch)
  plain_api_kt = kmp_apis / "PlainApi.kt"
  plain_api_kt.write_text(
    f'package sample{nl}@Suppress("UNCHECKED_CAST"){nl}fun call() = 1{nl}',
    encoding="utf-8",
  )

  # 4. API file with OptimizationApi, wildcard imports, constructors, @param, and private @Serializable wrapper
  opt_api_kt = kmp_apis / "OptimizationApi.kt"
  opt_api_kt.write_text(
    f'@file:Suppress("UnusedImport"){nl}'
    f"package sample{nl}"
    f"import io.healthplatform.pulsequery.api.infrastructure.*{nl}"
    f"import kotlinx.serialization.*{nl}"
    f"import kotlinx.serialization.descriptors.*{nl}"
    f"import kotlinx.serialization.encoding.*{nl}"
    f"open class OptimizationApi : ApiClient {{{nl}"
    f"    constructor({nl}"
    f"        baseUrl: String = ApiClient.BASE_URL,{nl}"
    f"        httpClientEngine: HttpClientEngine? = null{nl}"
    f"    ){nl}"
    f"    constructor({nl}"
    f"        baseUrl: String,{nl}"
    f"        httpClient: HttpClient{nl}"
    f"    ){nl}"
    f"    /**{nl}"
    f"     * Endpoint{nl}"
    f"     * @param instId{nl}"
    f"     */{nl}"
    f"    @Serializable(ItemList.Companion::class){nl}"
    f"    private class ItemList(val value: List<String>) {{{nl}"
    f"        companion object : KSerializer<ItemList> {{{nl}"
    f"            private val serializer: KSerializer<List<String>> = serializer<List<String>>(){nl}"
    f"            override val descriptor = serializer.descriptor{nl}"
    f"            override fun serialize(encoder: Encoder, value: ItemList) = serializer.serialize(encoder, value.value){nl}"
    f"            override fun deserialize(decoder: Decoder) = ItemList(serializer.deserialize(decoder)){nl}"
    f"        }}{nl}"
    f"    }}{nl}"
    f"}}{nl}",
    encoding="utf-8",
  )

  normalize_api_client.normalize_kmp_client(kmp_root)
  assert "UNCHECKED_CAST" not in plain_api_kt.read_text(encoding="utf-8")
  assert "Enumerated wire option." in model_kt.read_text(encoding="utf-8")
  assert "OpenAPI client for `/api/v1/optimization`" in opt_api_kt.read_text(encoding="utf-8")

  # Also test when models_dir does not exist
  kmp_no_models = tmp_path / "kmp-no-models"
  (kmp_no_models / "apis").mkdir(parents=True)
  normalize_api_client.normalize_kmp_client(kmp_no_models)
