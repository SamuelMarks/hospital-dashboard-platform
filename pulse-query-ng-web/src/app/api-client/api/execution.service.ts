/**
 * @fileoverview Generated OpenAPI Angular service for Hospital Analytics Platform.
 */

import { Service, inject } from '@angular/core';
import { HttpClient, HttpResponse, HttpEvent, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';

import { BASE_PATH } from '../variables';
import { Configuration } from '../configuration';
import { BaseService } from '../api.base.service';
import { OpenApiHttpParams, QueryParamStyle } from '../query.params';

/**
 * Injectable OpenAPI client service.
 */
@Service()
export class ExecutionService extends BaseService {
  /** Angular HttpClient used to dispatch REST requests. */
  protected readonly httpClient = inject(HttpClient);

  /** Initializes the service with optional base path and OpenAPI configuration. */
  constructor() {
    super(inject(BASE_PATH, { optional: true }), inject(Configuration, { optional: true }));
  }

  /**
   * Refresh Dashboard
   * Refreshes data for ALL widgets in a specific dashboard. Injects global_params into SQL queries before execution.  Args:     dashboard_id (UUID): ID of the target dashboard to refresh.     current_user (User): Authenticated user requesting the refresh.     db (AsyncSession): PostgreSQL async database session.     authorization (Optional[str]): Authorization header for token forwarding.     accept_language (Optional[str]): Preferred response language header.     global_params (dict[str, Any]): Global filter parameters for queries.  Returns:     dict[UUID, Any]: Map of widget UUID to execution results.  Raises:     HTTPException: 404 if dashboard not found or user lacks access.
   * @endpoint post /api/v1/dashboards/{dashboard_id}/refresh
   * @param dashboardId Parameter `dashboardId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param authorization Parameter `authorization`.
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param requestBody Parameter `requestBody`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public refreshDashboardApiV1DashboardsDashboardIdRefreshPost(
    dashboardId: string,
    token?: string,
    authorization?: string,
    acceptLanguage?: string,
    requestBody?: Record<string, unknown>,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<Record<string, unknown>>;
  public refreshDashboardApiV1DashboardsDashboardIdRefreshPost(
    dashboardId: string,
    token?: string,
    authorization?: string,
    acceptLanguage?: string,
    requestBody?: Record<string, unknown>,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<Record<string, unknown>>>;
  public refreshDashboardApiV1DashboardsDashboardIdRefreshPost(
    dashboardId: string,
    token?: string,
    authorization?: string,
    acceptLanguage?: string,
    requestBody?: Record<string, unknown>,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<Record<string, unknown>>>;
  public refreshDashboardApiV1DashboardsDashboardIdRefreshPost(
    dashboardId: string,
    token?: string,
    authorization?: string,
    acceptLanguage?: string,
    requestBody?: Record<string, unknown>,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (dashboardId === null || dashboardId === undefined) {
      throw new Error(
        'Required parameter dashboardId was null or undefined when calling refreshDashboardApiV1DashboardsDashboardIdRefreshPost.',
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
    if (authorization !== undefined && authorization !== null) {
      localVarHeaders = localVarHeaders.set('authorization', String(authorization));
    }
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

    const localVarPath = `/api/v1/dashboards/${this.configuration.encodeParam({ name: 'dashboardId', value: dashboardId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/refresh`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<Record<string, unknown>>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: requestBody,
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
   * Refresh Widget
   * Refreshes data for a SINGLE widget. Supports ?force_refresh&#x3D;true to bypass cache.  Args:     dashboard_id (UUID): Target dashboard ID.     widget_id (UUID): Target widget ID within the dashboard.     current_user (User): Authenticated user requesting refresh.     db (AsyncSession): PostgreSQL async database session.     authorization (Optional[str]): Optional authorization header for forwarding.     accept_language (Optional[str]): Preferred response language header.     force_refresh (bool): Whether to bypass query cache.  Returns:     dict[UUID, Any]: Dictionary mapping widget ID to query execution payload.  Raises:     HTTPException: 404 if dashboard or widget not found or access denied.
   * @endpoint post /api/v1/dashboards/{dashboard_id}/widgets/{widget_id}/refresh
   * @param dashboardId Parameter `dashboardId`.
   * @param widgetId Parameter `widgetId`.
   * @param forceRefresh Parameter `forceRefresh`.
   * @param token JWT token query parameter for direct browser downloads
   * @param authorization Parameter `authorization`.
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost(
    dashboardId: string,
    widgetId: string,
    forceRefresh?: boolean,
    token?: string,
    authorization?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
      naturalText?: string;
      processor?: string;
      requestBody?: Record<string, unknown>;
    },
  ): Observable<Record<string, unknown>>;
  public refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost(
    dashboardId: string,
    widgetId: string,
    forceRefresh?: boolean,
    token?: string,
    authorization?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
      naturalText?: string;
      processor?: string;
      requestBody?: Record<string, unknown>;
    },
  ): Observable<HttpResponse<Record<string, unknown>>>;
  public refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost(
    dashboardId: string,
    widgetId: string,
    forceRefresh?: boolean,
    token?: string,
    authorization?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
      naturalText?: string;
      processor?: string;
      requestBody?: Record<string, unknown>;
    },
  ): Observable<HttpEvent<Record<string, unknown>>>;
  public refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost(
    dashboardId: string,
    widgetId: string,
    forceRefresh?: boolean,
    token?: string,
    authorization?: string,
    acceptLanguage?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
      naturalText?: string;
      processor?: string;
      requestBody?: Record<string, unknown>;
    },
  ): Observable<unknown> {
    if (dashboardId === null || dashboardId === undefined) {
      throw new Error(
        'Required parameter dashboardId was null or undefined when calling refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost.',
      );
    }
    if (widgetId === null || widgetId === undefined) {
      throw new Error(
        'Required parameter widgetId was null or undefined when calling refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost.',
      );
    }

    let localVarQueryParameters = new OpenApiHttpParams(this.encoder);

    localVarQueryParameters = this.addToHttpParams(
      localVarQueryParameters,
      'force_refresh',
      forceRefresh,
      QueryParamStyle.Form,
      true,
    );

    localVarQueryParameters = this.addToHttpParams(
      localVarQueryParameters,
      'natural_text',
      options?.naturalText,
      QueryParamStyle.Form,
      true,
    );

    localVarQueryParameters = this.addToHttpParams(
      localVarQueryParameters,
      'processor',
      options?.processor,
      QueryParamStyle.Form,
      true,
    );

    localVarQueryParameters = this.addToHttpParams(
      localVarQueryParameters,
      'token',
      token,
      QueryParamStyle.Form,
      true,
    );

    let localVarHeaders = this.defaultHeaders;
    if (authorization !== undefined && authorization !== null) {
      localVarHeaders = localVarHeaders.set('authorization', String(authorization));
    }
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

    const localVarPath = `/api/v1/dashboards/${this.configuration.encodeParam({ name: 'dashboardId', value: dashboardId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/widgets/${this.configuration.encodeParam({ name: 'widgetId', value: widgetId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/refresh`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<Record<string, unknown>>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        ...(options?.requestBody !== undefined ? { body: options.requestBody } : {}),
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
}
