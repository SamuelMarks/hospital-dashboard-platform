/**
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
