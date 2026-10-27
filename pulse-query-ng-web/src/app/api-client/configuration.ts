/**
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
    const jsonMime = new RegExp('^(application/json|[^;/ ]+/[^;/ ]+[+]json)[ ]*(;.*)?$', 'i');
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
