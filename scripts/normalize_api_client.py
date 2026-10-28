#!/usr/bin/env python3
"""
Deterministic OpenAPI Client Normalizer (`scripts/normalize_api_client.py`).

Post-processes the generated Angular TypeScript OpenAPI client in
`pulse-query-ng-web/src/app/api-client/` to eliminate all `any` types,
`<any>` type assertions, `// @ts-ignore` directives, constructor injection
anti-patterns, and incomplete JSDoc comments so the generated client passes
strict ESLint and TypeScript compilation without ignore exemptions.
"""

from __future__ import annotations

from pathlib import Path
import re

NL = chr(10)
ROOT_DIR = Path(__file__).resolve().parent.parent
ANGULAR_CLIENT_DIR = ROOT_DIR / "pulse-query-ng-web" / "src" / "app" / "api-client"
KMP_API_DIR = (
  ROOT_DIR
  / "PulseQuery"
  / "composeApp"
  / "src"
  / "commonMain"
  / "kotlin"
  / "io"
  / "healthplatform"
  / "pulsequery"
  / "api"
)


ENCODER_TS = """/**
 * @fileoverview Custom Angular HttpParameterCodec implementations for OpenAPI query serialization.
 */
import { HttpParameterCodec } from '@angular/common/http';

/**
 * Custom HttpParameterCodec that percent-encodes keys and values using standard `encodeURIComponent`.
 */
export class CustomHttpParameterCodec implements HttpParameterCodec {
  /**
   * Percent-encodes a query parameter key.
   *
   * @param k - Raw parameter key.
   * @returns Encoded parameter key.
   */
  encodeKey(k: string): string {
    return encodeURIComponent(k);
  }

  /**
   * Percent-encodes a query parameter value.
   *
   * @param v - Raw parameter value.
   * @returns Encoded parameter value.
   */
  encodeValue(v: string): string {
    return encodeURIComponent(v);
  }

  /**
   * Decodes a percent-encoded query parameter key.
   *
   * @param k - Encoded parameter key.
   * @returns Decoded parameter key.
   */
  decodeKey(k: string): string {
    return decodeURIComponent(k);
  }

  /**
   * Decodes a percent-encoded query parameter value.
   *
   * @param v - Encoded parameter value.
   * @returns Decoded parameter value.
   */
  decodeValue(v: string): string {
    return decodeURIComponent(v);
  }
}

/**
 * Identity HttpParameterCodec that passes pre-encoded keys and values through unchanged.
 */
export class IdentityHttpParameterCodec implements HttpParameterCodec {
  /**
   * Returns the pre-encoded parameter key unchanged.
   *
   * @param k - Pre-encoded parameter key.
   * @returns Unmodified parameter key.
   */
  encodeKey(k: string): string {
    return k;
  }

  /**
   * Returns the pre-encoded parameter value unchanged.
   *
   * @param v - Pre-encoded parameter value.
   * @returns Unmodified parameter value.
   */
  encodeValue(v: string): string {
    return v;
  }

  /**
   * Returns the parameter key unchanged.
   *
   * @param k - Parameter key.
   * @returns Unmodified parameter key.
   */
  decodeKey(k: string): string {
    return k;
  }

  /**
   * Returns the parameter value unchanged.
   *
   * @param v - Parameter value.
   * @returns Unmodified parameter value.
   */
  decodeValue(v: string): string {
    return v;
  }
}
"""

PARAM_TS = """/**
 * @fileoverview OpenAPI parameter metadata types and serialization style definitions.
 */

/**
 * Standard parameter styles defined by the OpenAPI specification.
 */
export type StandardParamStyle =
  | 'matrix'
  | 'label'
  | 'form'
  | 'simple'
  | 'spaceDelimited'
  | 'pipeDelimited'
  | 'deepObject';

/**
 * OpenAPI standard parameter style or custom style identifier.
 */
export type ParamStyle = StandardParamStyle | string;

/**
 * Standard parameter locations defined by the OpenAPI specification.
 */
export type ParamLocation = 'query' | 'header' | 'path' | 'cookie';

/**
 * Standard primitive and composite data types defined by the OpenAPI specification.
 */
export type StandardDataType = 'integer' | 'number' | 'boolean' | 'string' | 'object' | 'array';

/**
 * OpenAPI data type identifier.
 */
export type DataType = StandardDataType | string;

/**
 * Standard data format modifiers defined by the OpenAPI specification.
 */
export type StandardDataFormat =
  | 'int32'
  | 'int64'
  | 'float'
  | 'double'
  | 'byte'
  | 'binary'
  | 'date'
  | 'date-time'
  | 'password';

/**
 * OpenAPI data format modifier or custom format string.
 */
export type DataFormat = StandardDataFormat | string;

/**
 * Descriptor for a single OpenAPI path, query, header, or cookie parameter.
 */
export interface Param {
  /** Parameter name. */
  name: string;
  /** Raw parameter value. */
  value: unknown;
  /** Parameter target location. */
  in: ParamLocation;
  /** OpenAPI serialization style. */
  style: ParamStyle;
  /** Whether composite values should be exploded into separate key-value pairs. */
  explode: boolean;
  /** OpenAPI data type name. */
  dataType: DataType;
  /** Optional OpenAPI format modifier. */
  dataFormat: DataFormat | undefined;
}
"""

VARIABLES_TS = """/**
 * @fileoverview Dependency injection tokens and collection format delimiters for the OpenAPI client.
 */
import { InjectionToken } from '@angular/core';

/**
 * Injection token providing the base URL for OpenAPI HTTP requests.
 */
export const BASE_PATH = new InjectionToken<string>('basePath');

/**
 * Map of OpenAPI collection format identifiers to their separator characters.
 */
export const COLLECTION_FORMATS = {
  csv: ',',
  tsv: '   ',
  ssv: ' ',
  pipes: '|',
};
"""

PROVIDE_API_TS = """/**
 * @fileoverview Standalone Angular provider factory for configuring the generated OpenAPI client.
 */
import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { Configuration, ConfigurationParameters } from './configuration';
import { BASE_PATH } from './variables';

/**
 * Returns the environment providers for configuring the OpenAPI client in `ApplicationConfig`.
 *
 * @param configOrBasePath - Base URL string or `ConfigurationParameters` options object.
 * @returns Angular `EnvironmentProviders` registering `BASE_PATH` or `Configuration`.
 */
export function provideApi(
  configOrBasePath: string | ConfigurationParameters,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    typeof configOrBasePath === 'string'
      ? { provide: BASE_PATH, useValue: configOrBasePath }
      : {
          provide: Configuration,
          useValue: new Configuration({ ...configOrBasePath }),
        },
  ]);
}
"""

API_MODULE_TS = """/**
 * @fileoverview Angular NgModule wrapper providing the OpenAPI `Configuration` singleton.
 */
import { NgModule, ModuleWithProviders, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Configuration } from './configuration';

/**
 * NgModule registering OpenAPI client configuration providers.
 */
@NgModule({
  imports: [],
  declarations: [],
  exports: [],
  providers: [],
})
export class ApiModule {
  /**
   * Creates a root `ModuleWithProviders` configured with a custom `Configuration` factory.
   *
   * @param configurationFactory - Factory function returning a `Configuration` instance.
   * @returns Root `ModuleWithProviders<ApiModule>` registration.
   */
  public static forRoot(configurationFactory: () => Configuration): ModuleWithProviders<ApiModule> {
    return {
      ngModule: ApiModule,
      providers: [{ provide: Configuration, useFactory: configurationFactory }],
    };
  }

  /**
   * Verifies that `ApiModule` is imported only once and that `HttpClient` is available.
   */
  constructor() {
    const parentModule = inject(ApiModule, { optional: true, skipSelf: true });
    const http = inject(HttpClient, { optional: true });
    if (parentModule) {
      throw new Error('ApiModule is already loaded. Import in your base AppModule only.');
    }
    if (!http) {
      throw new Error(
        'You need to import the HttpClientModule in your AppModule! See https://github.com/angular/angular/issues/20575',
      );
    }
  }
}
"""

CONFIGURATION_TS = """/**
 * @fileoverview Runtime configuration and credential management for the OpenAPI Angular client.
 */
import { HttpHeaders, HttpParams, HttpParameterCodec } from '@angular/common/http';
import { Param } from './param';

/**
 * Initialization parameters for constructing an OpenAPI `Configuration` instance.
 */
export interface ConfigurationParameters {
  /** Optional map of API key credentials keyed by security scheme name. */
  apiKeys?: Record<string, string>;
  /** Optional HTTP Basic authentication username. */
  username?: string;
  /** Optional HTTP Basic authentication password. */
  password?: string;
  /** Optional bearer access token string or getter callback. */
  accessToken?: string | (() => string);
  /** Optional base URL prefix for API requests. */
  basePath?: string;
  /** Whether cross-site requests should include credentials/cookies. */
  withCredentials?: boolean;
  /** Custom query and form parameter codec. */
  encoder?: HttpParameterCodec;
  /** Custom path parameter encoder function. */
  encodeParam?: (param: Param) => string;
  /** Map of security scheme names to credential values or getter callbacks. */
  credentials?: Record<string, string | (() => string | undefined)>;
}

/**
 * Holds runtime configuration, MIME negotiation helpers, and authentication credentials
 * for generated OpenAPI services.
 */
export class Configuration {
  /** Optional map of API key credentials keyed by security scheme name. */
  apiKeys?: Record<string, string>;
  /** Optional HTTP Basic authentication username. */
  username?: string;
  /** Optional HTTP Basic authentication password. */
  password?: string;
  /** Optional bearer access token string or getter callback. */
  accessToken?: string | (() => string);
  /** Optional base URL prefix for API requests. */
  basePath?: string;
  /** Whether cross-site requests should include credentials/cookies. */
  withCredentials?: boolean;
  /** Custom query and form parameter codec. */
  encoder?: HttpParameterCodec;
  /** Path parameter encoder function. */
  encodeParam: (param: Param) => string;
  /** Map of security scheme names to credential values or getter callbacks. */
  credentials: Record<string, string | (() => string | undefined)>;

  /**
   * Initializes a new `Configuration` instance.
   *
   * @param configurationParameters - Optional initial configuration parameters.
   */
  constructor(configurationParameters: ConfigurationParameters = {}) {
    const {
      accessToken,
      apiKeys,
      basePath,
      credentials,
      encodeParam,
      encoder,
      password,
      username,
      withCredentials,
    } = configurationParameters;
    if (apiKeys) {
      this.apiKeys = apiKeys;
    }
    if (username !== undefined) {
      this.username = username;
    }
    if (password !== undefined) {
      this.password = password;
    }
    if (accessToken !== undefined) {
      this.accessToken = accessToken;
    }
    if (basePath !== undefined) {
      this.basePath = basePath;
    }
    if (withCredentials !== undefined) {
      this.withCredentials = withCredentials;
    }
    if (encoder) {
      this.encoder = encoder;
    }
    this.encodeParam = encodeParam ?? ((param) => this.defaultEncodeParam(param));
    this.credentials = credentials ?? {};

    if (!this.credentials['OAuth2PasswordBearer']) {
      this.credentials['OAuth2PasswordBearer'] = () => {
        return typeof this.accessToken === 'function' ? this.accessToken() : this.accessToken;
      };
    }
  }

  /**
   * Selects the preferred `Content-Type` header from a list of candidate MIME types.
   *
   * @param contentTypes - Candidate MIME type strings.
   * @returns Selected MIME type string, or `undefined` when `contentTypes` is empty.
   */
  public selectHeaderContentType(contentTypes: string[]): string | undefined {
    if (contentTypes.length === 0) {
      return undefined;
    }

    const type = contentTypes.find((x: string) => this.isJsonMime(x));
    if (type === undefined) {
      return contentTypes[0];
    }
    return type;
  }

  /**
   * Selects the preferred `Accept` header from a list of candidate MIME types.
   *
   * @param accepts - Candidate accept MIME type strings.
   * @returns Selected MIME type string, or `undefined` when `accepts` is empty.
   */
  public selectHeaderAccept(accepts: string[]): string | undefined {
    if (accepts.length === 0) {
      return undefined;
    }

    const type = accepts.find((x: string) => this.isJsonMime(x));
    if (type === undefined) {
      return accepts[0];
    }
    return type;
  }

  /**
   * Checks whether the given MIME string represents a JSON media type.
   *
   * @param mime - MIME type string to evaluate.
   * @returns True if `mime` is a JSON media type.
   */
  public isJsonMime(mime: string): boolean {
    const jsonMime = new RegExp(
      '^(application/json|[^;/ ]+/[^;/ ]+[+]json)[ ]*(;.*)?$',
      'i',
    );
    return (
      mime !== null && (jsonMime.test(mime) || mime.toLowerCase() === 'application/json-patch+json')
    );
  }

  /**
   * Resolves the current credential value for a security scheme key.
   *
   * @param key - Security scheme identifier.
   * @returns Resolved credential string or `undefined`.
   */
  public lookupCredential(key: string): string | undefined {
    const value = this.credentials[key];
    return typeof value === 'function' ? value() : value;
  }

  /**
   * Appends a resolved credential to `HttpHeaders` if available.
   *
   * @param credentialKey - Security scheme identifier.
   * @param headerName - Target HTTP header name.
   * @param headers - Existing `HttpHeaders` instance.
   * @param prefix - Optional prefix such as `'Bearer '`.
   * @returns Updated `HttpHeaders` instance.
   */
  public addCredentialToHeaders(
    credentialKey: string,
    headerName: string,
    headers: HttpHeaders,
    prefix?: string,
  ): HttpHeaders {
    const value = this.lookupCredential(credentialKey);
    return value ? headers.set(headerName, (prefix ?? '') + value) : headers;
  }

  /**
   * Appends a resolved credential to `HttpParams` if available.
   *
   * @param credentialKey - Security scheme identifier.
   * @param paramName - Target query parameter name.
   * @param query - Existing `HttpParams` instance.
   * @returns Updated `HttpParams` instance.
   */
  public addCredentialToQuery(
    credentialKey: string,
    paramName: string,
    query: HttpParams,
  ): HttpParams {
    const value = this.lookupCredential(credentialKey);
    return value ? query.set(paramName, value) : query;
  }

  /**
   * Default path parameter encoder handling ISO-8601 dates and primitive values.
   *
   * @param param - Parameter descriptor to encode.
   * @returns URL-encoded string representation of the parameter value.
   */
  private defaultEncodeParam(param: Param): string {
    const value =
      param.dataFormat === 'date-time' && param.value instanceof Date
        ? param.value.toISOString()
        : param.value;

    return encodeURIComponent(String(value));
  }
}
"""

QUERY_PARAMS_TS = """/**
 * @fileoverview OpenAPI query parameter builder supporting form, deepObject, and delimited styles.
 */
import { HttpParams, HttpParameterCodec } from '@angular/common/http';
import { CustomHttpParameterCodec, IdentityHttpParameterCodec } from './encoder';

/**
 * OpenAPI query parameter serialization styles.
 */
export enum QueryParamStyle {
  /** JSON-serialized parameter value. */
  Json,
  /** Standard form-style query parameter. */
  Form,
  /** Bracketed nested key-value query parameter. */
  DeepObject,
  /** Space-delimited array parameter. */
  SpaceDelimited,
  /** Pipe-delimited array parameter. */
  PipeDelimited,
}

/**
 * Allowed unencoded delimiter characters for non-exploded collection query parameters.
 */
export type Delimiter = ',' | ' ' | '|';

/**
 * Per-parameter serialization options for `OpenApiHttpParams`.
 */
export interface ParamOptions {
  /** When true, serialized as multiple repeated key=value pairs. */
  explode?: boolean;
  /** Delimiter used when `explode` is false. */
  delimiter?: Delimiter;
}

/**
 * Internal entry storing a parameter's values and resolved serialization options.
 */
interface ParamEntry {
  /** Raw string values associated with the parameter key. */
  values: string[];
  /** Resolved explode and delimiter options. */
  options: Required<ParamOptions>;
}

/**
 * Mutable builder for OpenAPI query parameters supporting per-parameter explode and delimiter options.
 */
export class OpenApiHttpParams {
  /** Internal map of parameter keys to values and serialization options. */
  private params = new Map<string, ParamEntry>();
  /** Default serialization options applied when not overridden per parameter. */
  private defaults: Required<ParamOptions>;
  /** Codec used to percent-encode keys and values. */
  private encoder: HttpParameterCodec;

  /**
   * Initializes a new `OpenApiHttpParams` builder.
   *
   * @param encoder - Optional parameter codec.
   * @param defaults - Optional default `explode` and `delimiter` settings.
   */
  constructor(
    encoder?: HttpParameterCodec,
    defaults?: ParamOptions,
  ) {
    this.encoder = encoder || new CustomHttpParameterCodec();
    this.defaults = {
      explode: defaults?.explode ?? true,
      delimiter: defaults?.delimiter ?? ',',
    };
  }

  /**
   * Merges optional per-parameter options with the instance defaults.
   *
   * @param local - Optional per-parameter overrides.
   * @returns Fully populated `Required<ParamOptions>`.
   */
  private resolveOptions(local?: ParamOptions): Required<ParamOptions> {
    return {
      explode: local?.explode ?? this.defaults.explode,
      delimiter: local?.delimiter ?? this.defaults.delimiter,
    };
  }

  /**
   * Replaces a parameter's values and optional serialization options.
   *
   * @param key - Query parameter name.
   * @param values - Single string value or array of string values.
   * @param options - Optional serialization overrides.
   * @returns This `OpenApiHttpParams` instance for chaining.
   */
  set(key: string, values: string[] | string, options?: ParamOptions): this {
    const arr = Array.isArray(values) ? values.slice() : [values];
    const opts = this.resolveOptions(options);
    this.params.set(key, { values: arr, options: opts });
    return this;
  }

  /**
   * Appends a single value to the specified query parameter.
   *
   * @param key - Query parameter name.
   * @param value - Value string to append.
   * @param options - Optional serialization overrides.
   * @returns This `OpenApiHttpParams` instance for chaining.
   */
  append(key: string, value: string, options?: ParamOptions): this {
    const entry = this.params.get(key);
    if (entry) {
      if (options) {
        entry.options = this.resolveOptions({ ...entry.options, ...options });
      }
      entry.values.push(value);
    } else {
      this.set(key, [value], options);
    }
    return this;
  }

  /**
   * Serializes all stored parameters into a URL query string.
   *
   * @returns Encoded query string.
   */
  toString(): string {
    const records = this.toRecord();
    const parts: string[] = [];

    for (const key in records) {
      parts.push(`${key}=${records[key]}`);
    }

    return parts.join('&');
  }

  /**
   * Converts stored parameters into a record suitable for `HttpParams.appendAll`.
   *
   * @returns Record mapping encoded keys to encoded values or value arrays.
   */
  toRecord(): Record<string, string | number | boolean | readonly (string | number | boolean)[]> {
    const parts: Record<
      string,
      string | number | boolean | readonly (string | number | boolean)[]
    > = {};

    for (const [key, entry] of this.params.entries()) {
      const encodedKey = this.encoder.encodeKey(key);

      if (entry.options.explode) {
        parts[encodedKey] = entry.values.map((v) => this.encoder.encodeValue(v));
      } else {
        const encodedValues = entry.values.map((v) => this.encoder.encodeValue(v));
        parts[encodedKey] = encodedValues.join(entry.options.delimiter);
      }
    }

    return parts;
  }

  /**
   * Converts this builder into an Angular `HttpParams` instance using `IdentityHttpParameterCodec`.
   *
   * @returns Populated Angular `HttpParams` instance.
   */
  toHttpParams(): HttpParams {
    const records = this.toRecord();
    const httpParams = new HttpParams({ encoder: new IdentityHttpParameterCodec() });
    return httpParams.appendAll(records);
  }
}

/**
 * Flattens an object into delimiter-separated key-value pairs on `OpenApiHttpParams`.
 *
 * @param httpParams - Target `OpenApiHttpParams` accumulator.
 * @param key - Query parameter name.
 * @param item - Object record whose entries should be flattened.
 * @param delimiter - Separator character placed between entries.
 * @returns Updated `OpenApiHttpParams` instance.
 */
export function concatHttpParamsObject(
  httpParams: OpenApiHttpParams,
  key: string,
  item: Record<string, unknown>,
  delimiter: Delimiter,
): OpenApiHttpParams {
  const keyAndValues: string[] = [];

  for (const k in item) {
    keyAndValues.push(k);

    const value = item[k];

    if (Array.isArray(value)) {
      keyAndValues.push(...value.map(convertToString));
    } else {
      keyAndValues.push(convertToString(value));
    }
  }

  return httpParams.set(key, keyAndValues, { explode: false, delimiter: delimiter });
}

/**
 * Converts a Date or primitive value to its string representation.
 *
 * @param value - Value to stringify.
 * @returns ISO-8601 string for `Date` instances, or `String(value)` otherwise.
 */
function convertToString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  } else {
    return String(value);
  }
}
"""

API_BASE_SERVICE_TS = """/**
 * @fileoverview Base class for generated OpenAPI Angular services, providing strongly typed
 * HTTP parameter serialization and `HttpClient.request` overload dispatch without `any`.
 */
import {
  HttpClient,
  HttpContext,
  HttpHeaders,
  HttpParams,
  HttpParameterCodec,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { CustomHttpParameterCodec } from './encoder';
import { Configuration } from './configuration';
import { OpenApiHttpParams, QueryParamStyle, concatHttpParamsObject } from './query.params';

/**
 * Strongly typed request options passed to `BaseService.executeRequest`.
 */
export interface ApiRequestOptions {
  /** Optional request payload body. */
  body?: unknown;
  /** HTTP headers to include with the request. */
  headers?: HttpHeaders;
  /** Angular HttpContext metadata. */
  context?: HttpContext;
  /** Portion of the HTTP response to observe. */
  observe?: 'body' | 'events' | 'response';
  /** Encoded query parameters. */
  params?: HttpParams;
  /** Whether to emit upload/download progress events. */
  reportProgress?: boolean;
  /** Expected response payload encoding. */
  responseType?: 'json' | 'text' | 'blob';
  /** Whether to send cookies/credentials with cross-site requests. */
  withCredentials?: boolean;
  /** TransferCache configuration for SSR hydration. */
  transferCache?: boolean;
}

/**
 * Shared base class for all generated OpenAPI Angular HTTP services.
 */
export class BaseService {
  /** Fallback base URL when none is provided via DI or `Configuration`. */
  protected basePath = 'http://localhost';
  /** Default HTTP headers included on outgoing requests. */
  public defaultHeaders = new HttpHeaders();
  /** Active OpenAPI client configuration. */
  public configuration: Configuration;
  /** Parameter codec used for query/form serialization. */
  public encoder: HttpParameterCodec;

  /**
   * Initializes the base service with an optional base path and `Configuration`.
   *
   * @param basePath - Optional base URL string or array of base URLs.
   * @param configuration - Optional OpenAPI `Configuration` instance.
   */
  constructor(basePath?: string | string[] | null, configuration?: Configuration | null) {
    this.configuration = configuration || new Configuration();
    if (typeof this.configuration.basePath !== 'string') {
      const firstBasePath = Array.isArray(basePath) ? basePath[0] : undefined;
      if (firstBasePath !== undefined) {
        basePath = firstBasePath;
      }

      if (typeof basePath !== 'string') {
        basePath = this.basePath;
      }
      this.configuration.basePath = basePath;
    }
    this.encoder = this.configuration.encoder || new CustomHttpParameterCodec();
  }

  /**
   * Checks whether the endpoint accepts `multipart/form-data` payloads.
   *
   * @param consumes - List of accepted MIME types for the operation.
   * @returns True when `multipart/form-data` is supported.
   */
  protected canConsumeForm(consumes: string[]): boolean {
    return consumes.indexOf('multipart/form-data') !== -1;
  }

  /**
   * Appends a form parameter to an `HttpParams` or `FormData` container.
   *
   * @param formParams - Existing `HttpParams` or `FormData` container.
   * @param key - Form field name.
   * @param value - Form field value.
   * @returns Updated `HttpParams` or `FormData` container.
   */
  protected appendFormParam(
    formParams: HttpParams | FormData,
    key: string,
    value: string | number | boolean,
  ): HttpParams | FormData {
    if (formParams instanceof HttpParams) {
      return formParams.append(key, String(value));
    }
    formParams.append(key, String(value));
    return formParams;
  }

  /**
   * Dispatches an HTTP request using strongly typed `HttpClient.request` overloads.
   *
   * @param httpClient - Angular `HttpClient` instance.
   * @param method - HTTP verb (`'get'`, `'post'`, `'put'`, `'delete'`, etc.).
   * @param url - Fully qualified request URL.
   * @param options - Typed request options including `observe` and `responseType`.
   * @returns Observable emitting the requested body, `HttpResponse`, or `HttpEvent`.
   */
  protected executeRequest<T>(
    httpClient: HttpClient,
    method: string,
    url: string,
    options: ApiRequestOptions,
  ): Observable<unknown> {
    const baseOptions = {
      ...(options.body !== undefined ? { body: options.body } : {}),
      ...(options.headers !== undefined ? { headers: options.headers } : {}),
      ...(options.context !== undefined ? { context: options.context } : {}),
      ...(options.params !== undefined ? { params: options.params } : {}),
      ...(options.reportProgress !== undefined ? { reportProgress: options.reportProgress } : {}),
      ...(options.withCredentials !== undefined
        ? { withCredentials: options.withCredentials }
        : {}),
      ...(options.transferCache !== undefined ? { transferCache: options.transferCache } : {}),
    };
    const observe = options.observe ?? 'body';
    const responseType = options.responseType ?? 'json';

    if (observe === 'response') {
      if (responseType === 'text') {
        return httpClient.request(method, url, {
          ...baseOptions,
          observe: 'response',
          responseType: 'text',
        });
      }
      if (responseType === 'blob') {
        return httpClient.request(method, url, {
          ...baseOptions,
          observe: 'response',
          responseType: 'blob',
        });
      }
      return httpClient.request<T>(method, url, {
        ...baseOptions,
        observe: 'response',
        responseType: 'json',
      });
    }

    if (observe === 'events') {
      if (responseType === 'text') {
        return httpClient.request(method, url, {
          ...baseOptions,
          observe: 'events',
          responseType: 'text',
        });
      }
      if (responseType === 'blob') {
        return httpClient.request(method, url, {
          ...baseOptions,
          observe: 'events',
          responseType: 'blob',
        });
      }
      return httpClient.request<T>(method, url, {
        ...baseOptions,
        observe: 'events',
        responseType: 'json',
      });
    }

    if (responseType === 'text') {
      return httpClient.request(method, url, {
        ...baseOptions,
        observe: 'body',
        responseType: 'text',
      });
    }
    if (responseType === 'blob') {
      return httpClient.request(method, url, {
        ...baseOptions,
        observe: 'body',
        responseType: 'blob',
      });
    }
    return httpClient.request<T>(method, url, {
      ...baseOptions,
      observe: 'body',
      responseType: 'json',
    });
  }

  /**
   * Serializes a query parameter value into `OpenApiHttpParams` according to its OpenAPI style.
   *
   * @param httpParams - Target `OpenApiHttpParams` accumulator.
   * @param key - Query parameter name.
   * @param value - Query parameter value to serialize.
   * @param paramStyle - OpenAPI parameter serialization style.
   * @param explode - Whether object/array values should be exploded into separate keys.
   * @returns Updated `OpenApiHttpParams` instance.
   */
  protected addToHttpParams(
    httpParams: OpenApiHttpParams,
    key: string,
    value: unknown,
    paramStyle: QueryParamStyle,
    explode: boolean,
  ): OpenApiHttpParams {
    if (value === null || value === undefined) {
      return httpParams;
    }

    if (paramStyle === QueryParamStyle.DeepObject) {
      if (typeof value !== 'object') {
        throw Error(`An object must be provided for key ${key} as it is a deep object`);
      }

      const recordValue = value as Record<string, unknown>;
      return Object.keys(recordValue).reduce(
        (hp, k) => hp.append(`${key}[${k}]`, String(recordValue[k])),
        httpParams,
      );
    } else if (paramStyle === QueryParamStyle.Json) {
      return httpParams.append(key, JSON.stringify(value));
    } else {
      if (Object(value) !== value) {
        return httpParams.append(key, String(value));
      } else if (value instanceof Date) {
        return httpParams.append(key, value.toISOString());
      } else if (Array.isArray(value)) {
        const stringValues = value.map((item) => String(item));
        if (paramStyle === QueryParamStyle.Form) {
          return httpParams.set(key, stringValues, { explode: explode, delimiter: ',' });
        } else if (paramStyle === QueryParamStyle.SpaceDelimited) {
          return httpParams.set(key, stringValues, { explode: explode, delimiter: ' ' });
        } else {
          return httpParams.set(key, stringValues, { explode: explode, delimiter: '|' });
        }
      } else {
        const recordValue = value as Record<string, unknown>;
        if (paramStyle === QueryParamStyle.Form) {
          if (explode) {
            Object.keys(recordValue).forEach((k) => {
              httpParams = this.addToHttpParams(httpParams, k, recordValue[k], paramStyle, explode);
            });
            return httpParams;
          } else {
            return concatHttpParamsObject(httpParams, key, recordValue, ',');
          }
        } else if (paramStyle === QueryParamStyle.SpaceDelimited) {
          return concatHttpParamsObject(httpParams, key, recordValue, ' ');
        } else {
          return concatHttpParamsObject(httpParams, key, recordValue, '|');
        }
      }
    }
  }
}
"""


def _find_matching_angle(text: str, start_inner: int) -> int:
  """
  Finds the index immediately after the closing `>` matching an opening `<` at `start_inner - 1`.

  Args:
      text (str): Source text containing angle-bracket generics.
      start_inner (int): Index of the first character inside `<...>`.

  Returns:
      int: Index immediately after the matching `>`, or `-1` if unbalanced.
  """
  depth = 1
  pos = start_inner
  while pos < len(text) and depth > 0:
    if text[pos] == "<":
      depth += 1
    elif text[pos] == ">":
      depth -= 1
    pos += 1
  return pos if depth == 0 else -1


def _replace_array_syntax(text: str) -> str:
  """
  Recursively replaces `Array<T>` with `T[]` (including nested generics such as `Record<K, V>`).

  Args:
      text (str): Source TypeScript text.

  Returns:
      str: Normalized TypeScript text using `T[]` array syntax.
  """
  while "Array<" in text:
    idx = text.find("Array<")
    end_pos = _find_matching_angle(text, idx + len("Array<"))
    if end_pos == -1:
      break
    inner = _replace_array_syntax(text[idx + len("Array<") : end_pos - 1].strip())
    replacement = f"({inner})[]" if "|" in inner else f"{inner}[]"
    text = text[:idx] + replacement + text[end_pos:]
  return text


def _normalize_indexed_objects(text: str) -> str:
  """
  Replaces `{ [key: string]: V }` and `Record<string, any>` with `Record<string, V>` from innermost to outermost.

  Args:
      text (str): Source TypeScript text.

  Returns:
      str: Normalized TypeScript text using `Record<string, ...>`.
  """
  text = re.sub(r"\{\s*\[key:\s*string\]:\s*any\s*;?\s*\}", "Record<string, unknown>", text)
  inner_pattern = re.compile(r"\{\s*\[key:\s*string\]:\s*([^{};]+?)\s*;?\s*\}")
  while inner_pattern.search(text):
    text = inner_pattern.sub(lambda m: f"Record<string, {m.group(1).strip()}>", text)
  return text.replace("Record<string, any>", "Record<string, unknown>")


def _strip_unused_model_imports(text: str) -> str:
  """
  Removes unused `import { Sym } from '...'` lines from a generated model file.

  Args:
      text (str): Model TypeScript content.

  Returns:
      str: Model TypeScript content with unused imports removed.
  """
  lines = text.splitlines()
  body_start = next((idx for idx, line in enumerate(lines) if line.startswith("export ")), 0)
  code_only = re.sub(r"/\*.*?\*/", "", NL.join(lines[body_start:]), flags=re.DOTALL)
  filtered: list[str] = []
  for idx, line in enumerate(lines):
    m = re.match(r"import\s+\{\s*([A-Za-z0-9_]+)\s*\}\s+from\s+", line) if idx < body_start else None
    if m and not re.search(rf"\b{re.escape(m.group(1))}\b", code_only):
      continue
    filtered.append(line)
  return NL.join(filtered) + NL


def _ensure_model_jsdoc(text: str) -> str:
  """
  Ensures every exported declaration and interface property in a model file has a JSDoc comment.

  Args:
      text (str): Model TypeScript content.

  Returns:
      str: Model TypeScript content with complete JSDoc blocks.
  """
  out_lines: list[str] = []
  in_interface = False
  brace_depth = 0
  prev_nonempty = ""
  for line in text.splitlines():
    stripped = line.strip()
    has_doc = prev_nonempty.endswith("*/")
    if stripped.startswith("export interface "):
      in_interface = True
      brace_depth = stripped.count("{") - stripped.count("}")
      if not has_doc:
        out_lines.append("/** Generated OpenAPI model interface. */")
    elif stripped.startswith(("export type ", "export const ")) and not has_doc:
      out_lines.append("/** Generated OpenAPI type definition. */")
    elif in_interface and stripped == "}" and brace_depth == 1:
      in_interface = False
      brace_depth = 0
    elif in_interface and stripped and not stripped.startswith(("/", "*", "}", "{")) and ":" in stripped and not has_doc:
      prop_name = stripped.split(":")[0].rstrip("?").strip()
      indent = line[: len(line) - len(line.lstrip())]
      out_lines.append(f"{indent}/** Property `{prop_name}`. */")
    if in_interface and not stripped.startswith("export interface "):
      brace_depth += stripped.count("{") - stripped.count("}")
    out_lines.append(line)
    if stripped:
      prev_nonempty = stripped
  return NL.join(out_lines) + NL


def normalize_model_file(path: Path) -> None:
  """
  Normalizes a generated OpenAPI model file under `src/app/api-client/model/`.

  Args:
      path (Path): Path to the `.ts` model file.
  """
  text = path.read_text(encoding="utf-8")
  if path.name == "models.ts":
    if "@fileoverview" not in text:
      text = f"/**{NL} * @fileoverview Barrel export for generated OpenAPI model interfaces.{NL} */{NL}" + text
    path.write_text(text, encoding="utf-8")
    return

  if "@fileoverview" not in text:
    text = re.sub(
      r"^/\*\*\s*\*\s*Hospital Analytics Platform",
      f"/**{NL} * @fileoverview Generated OpenAPI model for Hospital Analytics Platform.",
      text,
      count=1,
    )
    if "@fileoverview" not in text:
      text = f"/**{NL} * @fileoverview Generated OpenAPI model definition.{NL} */{NL}" + text

  text = text.replace(f"// @ts-ignore{NL}", "")
  text = _normalize_indexed_objects(text)
  text = _replace_array_syntax(text)
  text = re.sub(r"export\s+namespace\s+[A-Za-z0-9_]+\s*\{\s*\}", "", text)
  text = text.replace(
    "export interface ValidationErrorLocInner {}",
    "export type ValidationErrorLocInner = string | number;",
  )
  if path.name == "dashboard-response.ts":
    text = text.replace("widgets?: WidgetResponse[];", "widgets: WidgetResponse[];")
  text = _strip_unused_model_imports(text)
  text = _ensure_model_jsdoc(text)
  path.write_text(text, encoding="utf-8")


def _fix_endpoint_jsdoc_block(match: re.Match[str]) -> str:
  """
  Ensures an `@endpoint` JSDoc block has descriptions on all `@param` tags and an `@returns` tag.

  Args:
      match (re.Match[str]): Regex match for a JSDoc comment block.

  Returns:
      str: Normalized JSDoc comment block.
  """
  block = match.group(0)
  if "@endpoint" not in block:
    return block
  fixed: list[str] = []
  has_returns = "@returns" in block
  for line in block.splitlines():
    param_match = re.match(r"^(\s*\*\s*@param\s+([A-Za-z0-9_]+))\s*$", line)
    if param_match:
      fixed.append(f"{param_match.group(1)} Parameter `{param_match.group(2)}`.")
    elif line.strip() == "*/" and not has_returns:
      fixed.append("   * @returns Observable emitting the API response.")
      fixed.append(line)
    else:
      fixed.append(line)
  return NL.join(fixed)


def _strip_unused_service_imports(text: str) -> str:
  """
  Removes unused imports from a generated OpenAPI Angular service file.

  Args:
      text (str): Service TypeScript content.

  Returns:
      str: Service TypeScript content with unused imports removed.
  """
  lines = text.splitlines()
  class_idx = next((i for i, l in enumerate(lines) if "@Injectable" in l or "@Service" in l), len(lines))
  body_code = re.sub(r"/\*[\s\S]*?\*/", "", NL.join(lines[class_idx:]))

  if not re.search(r"\bCOLLECTION_FORMATS\b", body_code):
    text = text.replace(
      "import { BASE_PATH, COLLECTION_FORMATS } from '../variables';",
      "import { BASE_PATH } from '../variables';",
    )

  optional_checks = (
    ("HttpHeaders,", r"\bHttpHeaders\b"),
    ("HttpParams,", r"\bHttpParams\b"),
    ("from '../model/http-validation-error'", r"\bHTTPValidationError\b"),
    ("from '../query.params'", r"\b(OpenApiHttpParams|QueryParamStyle)\b"),
  )
  cleaned: list[str] = []
  for line in text.splitlines():
    stripped = line.strip()
    if any(token in stripped and not re.search(pat, body_code) for token, pat in optional_checks):
      continue
    cleaned.append(line)
  result = NL.join(cleaned) + NL
  if re.search(r"\b(OpenApiHttpParams|QueryParamStyle)\b", body_code) and "from '../query.params'" not in result:
    result = result.replace(
      "import { BaseService } from '../api.base.service';",
      f"import {{ BaseService }} from '../api.base.service';{NL}import {{ OpenApiHttpParams, QueryParamStyle }} from '../query.params';",
    )
  return result


def normalize_service_file(path: Path) -> None:
  """
  Normalizes a generated OpenAPI service file under `src/app/api-client/api/`.

  Args:
      path (Path): Path to the `.service.ts` or `api.ts` file.
  """
  text = path.read_text(encoding="utf-8")
  if path.name == "api.ts":
    if "@fileoverview" not in text:
      text = f"/**{NL} * @fileoverview Barrel export for generated OpenAPI Angular services.{NL} */{NL}" + text
    path.write_text(text, encoding="utf-8")
    return

  text = re.sub(
    r"^/\*\*[\s\S]*?\*/\s*/\*\s*tslint:disable:[^*]*\*/",
    f"/**{NL} * @fileoverview Generated OpenAPI Angular service for Hospital Analytics Platform.{NL} */",
    text,
    count=1,
  )
  text = text.replace(f"// @ts-ignore{NL}", "")
  text = _normalize_indexed_objects(text)
  text = _replace_array_syntax(text)

  text = re.sub(
    r"import\s*\{\s*Inject,\s*Injectable,\s*Optional\s*\}\s*from\s*'@angular/core';",
    "import { Service, inject } from '@angular/core';",
    text,
  )
  text = re.sub(
    r"import\s*\{\s*Injectable,\s*inject\s*\}\s*from\s*'@angular/core';",
    "import { Service, inject } from '@angular/core';",
    text,
  )
  text = re.sub(
    r"constructor\(\s*protected\s+httpClient:\s*HttpClient,\s*@Optional\(\)\s*@Inject\(BASE_PATH\)\s*basePath:\s*string\s*\|\s*string\[\],\s*@Optional\(\)\s*configuration\?:\s*Configuration,\s*\)\s*\{\s*super\(basePath,\s*configuration\);\s*\}",
    """/** Angular HttpClient used to dispatch REST requests. */
  protected readonly httpClient = inject(HttpClient);

  /** Initializes the service with optional base path and OpenAPI configuration. */
  constructor() {
    super(
      inject(BASE_PATH, { optional: true }),
      inject(Configuration, { optional: true }),
    );
  }""",
    text,
  )

  if "Injectable OpenAPI client service." not in text:
    text = re.sub(
      r"@Injectable\(\{\s*providedIn:\s*'root',?\s*\}\)",
      f"/**{NL} * Injectable OpenAPI client service.{NL} */{NL}@Service()",
      text,
    )
  else:
    text = re.sub(
      r"@Injectable\(\{\s*providedIn:\s*'root',?\s*\}\)",
      "@Service()",
      text,
    )

  text = text.replace(
    "const canConsumeForm = this.canConsumeForm(consumes);",
    "void this.canConsumeForm(consumes);",
  )
  text = text.replace(
    "let localVarFormParams: { append(param: string, value: any): any };",
    "let localVarFormParams: HttpParams | FormData;",
  )
  text = text.replace("let localVarUseForm = false;", "const localVarUseForm = false;")
  text = text.replace(
    "let localVarConvertFormParamsToString = false;",
    "const localVarConvertFormParamsToString = false;",
  )
  text = text.replace("let localVarPath =", "const localVarPath =")
  text = re.sub(
    r"localVarFormParams\s*=\s*\(localVarFormParams\.append\('([^']+)',\s*<any>([A-Za-z0-9_]+)\)\s*as\s*any\)\s*\|\|\s*localVarFormParams;",
    r"localVarFormParams = this.appendFormParam(localVarFormParams, '\1', \2);",
    text,
  )

  text = text.replace("Observable<HttpResponse<any>>", "Observable<HttpResponse<unknown>>")
  text = text.replace("Observable<HttpEvent<any>>", "Observable<HttpEvent<unknown>>")
  text = text.replace("): Observable<any>;", "): Observable<unknown>;")
  text = text.replace("): Observable<any> {", "): Observable<unknown> {")
  text = text.replace("this.httpClient.request<any>(", "this.httpClient.request<unknown>(")
  text = text.replace("observe: any = 'body'", "observe: 'body' | 'events' | 'response' = 'body'")
  text = text.replace("reportProgress: boolean = false", "reportProgress = false")
  text = text.replace("<any>", "")
  req_prefix = "this.httpClient.request<"
  while req_prefix in text:
    idx = text.find(req_prefix)
    end_pos = _find_matching_angle(text, idx + len(req_prefix))
    if end_pos == -1 or end_pos >= len(text) or text[end_pos] != "(":
      break
    type_arg = text[idx + len(req_prefix) : end_pos - 1]
    after_paren = end_pos + 1
    while after_paren < len(text) and text[after_paren].isspace():
      after_paren += 1
    text = text[:idx] + f"this.executeRequest<{type_arg}>(this.httpClient, " + text[after_paren:]
  text = re.sub(r"/\*\*[\s\S]*?\*/", _fix_endpoint_jsdoc_block, text)
  text = _strip_unused_service_imports(text)
  path.write_text(text, encoding="utf-8")


def normalize_angular_client(client_dir: Path = ANGULAR_CLIENT_DIR) -> None:
  """
  Normalizes all files in the generated Angular OpenAPI client directory.

  Args:
      client_dir (Path): Root directory of the Angular OpenAPI client.
  """
  (client_dir / "encoder.ts").write_text(ENCODER_TS, encoding="utf-8")
  (client_dir / "param.ts").write_text(PARAM_TS, encoding="utf-8")
  (client_dir / "variables.ts").write_text(VARIABLES_TS, encoding="utf-8")
  (client_dir / "provide-api.ts").write_text(PROVIDE_API_TS, encoding="utf-8")
  (client_dir / "api.module.ts").write_text(API_MODULE_TS, encoding="utf-8")
  (client_dir / "configuration.ts").write_text(CONFIGURATION_TS, encoding="utf-8")
  (client_dir / "query.params.ts").write_text(QUERY_PARAMS_TS, encoding="utf-8")
  (client_dir / "api.base.service.ts").write_text(API_BASE_SERVICE_TS, encoding="utf-8")

  index_path = client_dir / "index.ts"
  if index_path.exists():
    idx_text = index_path.read_text(encoding="utf-8")
    if "@fileoverview" not in idx_text:
      index_path.write_text(
        f"/**{NL} * @fileoverview Root barrel export for the generated OpenAPI Angular client.{NL} */{NL}" + idx_text,
        encoding="utf-8",
      )

  model_dir = client_dir / "model"
  if model_dir.exists():
    for model_file in sorted(model_dir.glob("*.ts")):
      normalize_model_file(model_file)

  api_dir = client_dir / "api"
  if api_dir.exists():
    for service_file in sorted(api_dir.glob("*.ts")):
      normalize_service_file(service_file)


def normalize_kmp_client(kmp_api_dir: Path = KMP_API_DIR) -> None:
  """
  Normalizes generated Kotlin Multiplatform OpenAPI client files under `PulseQuery`
  by stripping redundant `@Suppress("UNCHECKED_CAST")` annotations.

  Args:
      kmp_api_dir (Path): Root directory of the KMP OpenAPI package.
  """
  apis_dir = kmp_api_dir / "apis"
  if not apis_dir.exists():
    return
  for kt_file in sorted(apis_dir.glob("*.kt")):
    lines = [
      line for line in kt_file.read_text(encoding="utf-8").splitlines() if line.strip() != '@Suppress("UNCHECKED_CAST")'
    ]
    kt_file.write_text(NL.join(lines) + NL, encoding="utf-8")


if __name__ == "__main__":
  normalize_angular_client()
  normalize_kmp_client()
