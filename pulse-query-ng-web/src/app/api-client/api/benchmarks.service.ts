/**
 * @fileoverview Generated OpenAPI Angular service for Hospital Analytics Platform.
 */

import { Service, inject } from '@angular/core';
import { HttpClient, HttpResponse, HttpEvent, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';

import { BenchmarkProgressUpdateRequest } from '../model/benchmark-progress-update-request';
import { BenchmarkScenarioSchema } from '../model/benchmark-scenario-schema';
import { BenchmarkTelemetryStateDict } from '../model/benchmark-telemetry-state-dict';

import { BASE_PATH } from '../variables';
import { Configuration } from '../configuration';
import { BaseService } from '../api.base.service';
import { OpenApiHttpParams, QueryParamStyle } from '../query.params';

/**
 * Injectable OpenAPI client service.
 */
@Service()
export class BenchmarksService extends BaseService {
  /** Angular HttpClient used to dispatch REST requests. */
  protected readonly httpClient = inject(HttpClient);

  /** Initializes the service with optional base path and OpenAPI configuration. */
  constructor() {
    super(inject(BASE_PATH, { optional: true }), inject(Configuration, { optional: true }));
  }

  /**
   * Get Optimization Benchmarks
   * Returns the gold-standard Hospital Operations Optimization benchmarks across Use Case 1 (&#x60;service_unit&#x60;), Use Case 2 (&#x60;surgical_scheduling&#x60;), and Use Case 3 (&#x60;staffing_optimization&#x60;).  Returns:     list[BenchmarkScenarioSchema]: Parsed optimization benchmark scenario items.
   * @endpoint get /api/v1/benchmarks/optimization
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public getOptimizationBenchmarksApiV1BenchmarksOptimizationGet(
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<BenchmarkScenarioSchema[]>;
  public getOptimizationBenchmarksApiV1BenchmarksOptimizationGet(
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<BenchmarkScenarioSchema[]>>;
  public getOptimizationBenchmarksApiV1BenchmarksOptimizationGet(
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<BenchmarkScenarioSchema[]>>;
  public getOptimizationBenchmarksApiV1BenchmarksOptimizationGet(
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    let localVarHeaders = this.defaultHeaders;

    const localVarHttpHeaderAcceptSelected: string | undefined =
      options?.httpHeaderAccept ?? this.configuration.selectHeaderAccept(['application/json']);
    if (localVarHttpHeaderAcceptSelected !== undefined) {
      localVarHeaders = localVarHeaders.set('Accept', localVarHttpHeaderAcceptSelected);
    }

    const localVarHttpContext: HttpContext = options?.context ?? new HttpContext();

    const localVarTransferCache: boolean = options?.transferCache ?? true;

    let responseType_: 'text' | 'json' | 'blob' = 'json';
    if (localVarHttpHeaderAcceptSelected) {
      if (localVarHttpHeaderAcceptSelected.startsWith('text')) {
        responseType_ = 'text';
      } else if (this.configuration.isJsonMime(localVarHttpHeaderAcceptSelected)) {
        responseType_ = 'json';
      } else {
        responseType_ = 'blob';
      }
    }

    const localVarPath = `/api/v1/benchmarks/optimization`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<BenchmarkScenarioSchema[]>(
      this.httpClient,
      'get',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        responseType: responseType_,
        ...(withCredentials ? { withCredentials } : {}),
        headers: localVarHeaders,
        observe: observe,
        ...(localVarTransferCache !== undefined ? { transferCache: localVarTransferCache } : {}),
        reportProgress: reportProgress,
      },
    );
  }

  /**
   * Get Sql Benchmarks
   * Returns the gold standard text-to-SQL benchmarks.  Returns:     list[BenchmarkScenarioSchema]: Parsed benchmark list from benchmark_gold.json.
   * @endpoint get /api/v1/benchmarks/sql
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public getSqlBenchmarksApiV1BenchmarksSqlGet(
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<BenchmarkScenarioSchema[]>;
  public getSqlBenchmarksApiV1BenchmarksSqlGet(
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<BenchmarkScenarioSchema[]>>;
  public getSqlBenchmarksApiV1BenchmarksSqlGet(
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<BenchmarkScenarioSchema[]>>;
  public getSqlBenchmarksApiV1BenchmarksSqlGet(
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    let localVarHeaders = this.defaultHeaders;

    const localVarHttpHeaderAcceptSelected: string | undefined =
      options?.httpHeaderAccept ?? this.configuration.selectHeaderAccept(['application/json']);
    if (localVarHttpHeaderAcceptSelected !== undefined) {
      localVarHeaders = localVarHeaders.set('Accept', localVarHttpHeaderAcceptSelected);
    }

    const localVarHttpContext: HttpContext = options?.context ?? new HttpContext();

    const localVarTransferCache: boolean = options?.transferCache ?? true;

    let responseType_: 'text' | 'json' | 'blob' = 'json';
    if (localVarHttpHeaderAcceptSelected) {
      if (localVarHttpHeaderAcceptSelected.startsWith('text')) {
        responseType_ = 'text';
      } else if (this.configuration.isJsonMime(localVarHttpHeaderAcceptSelected)) {
        responseType_ = 'json';
      } else {
        responseType_ = 'blob';
      }
    }

    const localVarPath = `/api/v1/benchmarks/sql`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<BenchmarkScenarioSchema[]>(
      this.httpClient,
      'get',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        responseType: responseType_,
        ...(withCredentials ? { withCredentials } : {}),
        headers: localVarHeaders,
        observe: observe,
        ...(localVarTransferCache !== undefined ? { transferCache: localVarTransferCache } : {}),
        reportProgress: reportProgress,
      },
    );
  }

  /**
   * Post Benchmark Progress
   * Updates the benchmark progress telemetry state (Admin only).  Args:     payload (BenchmarkProgressUpdateRequest): Telemetry progress fields.     current_user (User): Authenticated administrator.  Returns:     BenchmarkTelemetryStateDict: Updated telemetry state snapshot.
   * @endpoint post /api/v1/benchmarks/progress
   * @param benchmarkProgressUpdateRequest Parameter `benchmarkProgressUpdateRequest`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public postBenchmarkProgressApiV1BenchmarksProgressPost(
    benchmarkProgressUpdateRequest: BenchmarkProgressUpdateRequest,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<BenchmarkTelemetryStateDict>;
  public postBenchmarkProgressApiV1BenchmarksProgressPost(
    benchmarkProgressUpdateRequest: BenchmarkProgressUpdateRequest,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<BenchmarkTelemetryStateDict>>;
  public postBenchmarkProgressApiV1BenchmarksProgressPost(
    benchmarkProgressUpdateRequest: BenchmarkProgressUpdateRequest,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<BenchmarkTelemetryStateDict>>;
  public postBenchmarkProgressApiV1BenchmarksProgressPost(
    benchmarkProgressUpdateRequest: BenchmarkProgressUpdateRequest,
    token?: string,
    acceptLanguage?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (benchmarkProgressUpdateRequest === null || benchmarkProgressUpdateRequest === undefined) {
      throw new Error(
        'Required parameter benchmarkProgressUpdateRequest was null or undefined when calling postBenchmarkProgressApiV1BenchmarksProgressPost.',
      );
    }

    let localVarQueryParameters = new OpenApiHttpParams(this.encoder);

    localVarQueryParameters = this.addToHttpParams(
      localVarQueryParameters,
      'token',
      token,
      QueryParamStyle.Form,
      true,
    );

    let localVarHeaders = this.defaultHeaders;
    if (acceptLanguage !== undefined && acceptLanguage !== null) {
      localVarHeaders = localVarHeaders.set('Accept-Language', String(acceptLanguage));
    }

    // authentication (OAuth2PasswordBearer) required
    localVarHeaders = this.configuration.addCredentialToHeaders(
      'OAuth2PasswordBearer',
      'Authorization',
      localVarHeaders,
      'Bearer ',
    );

    const localVarHttpHeaderAcceptSelected: string | undefined =
      options?.httpHeaderAccept ?? this.configuration.selectHeaderAccept(['application/json']);
    if (localVarHttpHeaderAcceptSelected !== undefined) {
      localVarHeaders = localVarHeaders.set('Accept', localVarHttpHeaderAcceptSelected);
    }

    const localVarHttpContext: HttpContext = options?.context ?? new HttpContext();

    const localVarTransferCache: boolean = options?.transferCache ?? true;

    // to determine the Content-Type header
    const consumes: string[] = ['application/json'];
    const httpContentTypeSelected: string | undefined =
      this.configuration.selectHeaderContentType(consumes);
    if (httpContentTypeSelected !== undefined) {
      localVarHeaders = localVarHeaders.set('Content-Type', httpContentTypeSelected);
    }

    let responseType_: 'text' | 'json' | 'blob' = 'json';
    if (localVarHttpHeaderAcceptSelected) {
      if (localVarHttpHeaderAcceptSelected.startsWith('text')) {
        responseType_ = 'text';
      } else if (this.configuration.isJsonMime(localVarHttpHeaderAcceptSelected)) {
        responseType_ = 'json';
      } else {
        responseType_ = 'blob';
      }
    }

    const localVarPath = `/api/v1/benchmarks/progress`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<BenchmarkTelemetryStateDict>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: benchmarkProgressUpdateRequest,
        params: localVarQueryParameters.toHttpParams(),
        responseType: responseType_,
        ...(withCredentials ? { withCredentials } : {}),
        headers: localVarHeaders,
        observe: observe,
        ...(localVarTransferCache !== undefined ? { transferCache: localVarTransferCache } : {}),
        reportProgress: reportProgress,
      },
    );
  }

  /**
   * Stream Benchmark Progress
   * Server-Sent Events (SSE) endpoint providing real-time telemetry on active benchmark runs.  Args:     poll_interval_seconds (float): Optional delay after emitting a telemetry frame.  Returns:     StreamingResponse: SSE stream emitting live benchmark progress events.
   * @endpoint get /api/v1/benchmarks/progress
   * @param pollIntervalSeconds Parameter `pollIntervalSeconds`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public streamBenchmarkProgressApiV1BenchmarksProgressGet(
    pollIntervalSeconds?: number,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown>;
  public streamBenchmarkProgressApiV1BenchmarksProgressGet(
    pollIntervalSeconds?: number,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<unknown>>;
  public streamBenchmarkProgressApiV1BenchmarksProgressGet(
    pollIntervalSeconds?: number,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<unknown>>;
  public streamBenchmarkProgressApiV1BenchmarksProgressGet(
    pollIntervalSeconds?: number,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    let localVarQueryParameters = new OpenApiHttpParams(this.encoder);

    localVarQueryParameters = this.addToHttpParams(
      localVarQueryParameters,
      'poll_interval_seconds',
      pollIntervalSeconds,
      QueryParamStyle.Form,
      true,
    );

    let localVarHeaders = this.defaultHeaders;

    const localVarHttpHeaderAcceptSelected: string | undefined =
      options?.httpHeaderAccept ?? this.configuration.selectHeaderAccept(['application/json']);
    if (localVarHttpHeaderAcceptSelected !== undefined) {
      localVarHeaders = localVarHeaders.set('Accept', localVarHttpHeaderAcceptSelected);
    }

    const localVarHttpContext: HttpContext = options?.context ?? new HttpContext();

    const localVarTransferCache: boolean = options?.transferCache ?? true;

    let responseType_: 'text' | 'json' | 'blob' = 'json';
    if (localVarHttpHeaderAcceptSelected) {
      if (localVarHttpHeaderAcceptSelected.startsWith('text')) {
        responseType_ = 'text';
      } else if (this.configuration.isJsonMime(localVarHttpHeaderAcceptSelected)) {
        responseType_ = 'json';
      } else {
        responseType_ = 'blob';
      }
    }

    const localVarPath = `/api/v1/benchmarks/progress`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<unknown>(this.httpClient, 'get', `${basePath}${localVarPath}`, {
      context: localVarHttpContext,
      params: localVarQueryParameters.toHttpParams(),
      responseType: responseType_,
      ...(withCredentials ? { withCredentials } : {}),
      headers: localVarHeaders,
      observe: observe,
      ...(localVarTransferCache !== undefined ? { transferCache: localVarTransferCache } : {}),
      reportProgress: reportProgress,
    });
  }
}
