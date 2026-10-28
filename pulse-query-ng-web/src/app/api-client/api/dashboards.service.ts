/**
 * @fileoverview Generated OpenAPI Angular service for Hospital Analytics Platform.
 */

import { Service, inject } from '@angular/core';
import { HttpClient, HttpResponse, HttpEvent, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';

import { DashboardCreate } from '../model/dashboard-create';
import { DashboardResponse } from '../model/dashboard-response';
import { DashboardShareCreate } from '../model/dashboard-share-create';
import { DashboardShareResponse } from '../model/dashboard-share-response';
import { WidgetIn } from '../model/widget-in';
import { WidgetReorderRequest } from '../model/widget-reorder-request';
import { WidgetResponse } from '../model/widget-response';
import { WidgetUpdate } from '../model/widget-update';

import { BASE_PATH } from '../variables';
import { Configuration } from '../configuration';
import { BaseService } from '../api.base.service';
import { OpenApiHttpParams, QueryParamStyle } from '../query.params';

/**
 * Injectable OpenAPI client service.
 */
@Service()
export class DashboardsService extends BaseService {
  /** Angular HttpClient used to dispatch REST requests. */
  protected readonly httpClient = inject(HttpClient);

  /** Initializes the service with optional base path and OpenAPI configuration. */
  constructor() {
    super(inject(BASE_PATH, { optional: true }), inject(Configuration, { optional: true }));
  }

  /**
   * Clone Dashboard
   * Creates a deep copy of an existing dashboard and all its widgets. The new dashboard will have the name \&quot;Copy of {original_name}\&quot;.  Args:     dashboard_id (UUID): The ID of the dashboard to clone.     current_user (User): Authenticated user (must have access to the dashboard).     db (AsyncSession): Database session.     accept_language (Optional[str]): Language preference header.  Returns:     DashboardResponse: The newly created dashboard populated with cloned widgets.
   * @endpoint post /api/v1/dashboards/{dashboard_id}/clone
   * @param dashboardId Parameter `dashboardId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public cloneDashboardApiV1DashboardsDashboardIdClonePost(
    dashboardId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<DashboardResponse>;
  public cloneDashboardApiV1DashboardsDashboardIdClonePost(
    dashboardId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<DashboardResponse>>;
  public cloneDashboardApiV1DashboardsDashboardIdClonePost(
    dashboardId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<DashboardResponse>>;
  public cloneDashboardApiV1DashboardsDashboardIdClonePost(
    dashboardId: string,
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
    if (dashboardId === null || dashboardId === undefined) {
      throw new Error(
        'Required parameter dashboardId was null or undefined when calling cloneDashboardApiV1DashboardsDashboardIdClonePost.',
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

    const localVarPath = `/api/v1/dashboards/${this.configuration.encodeParam({ name: 'dashboardId', value: dashboardId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/clone`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<DashboardResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
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
   * Create Dashboard
   * Create a new empty dashboard.
   * @endpoint post /api/v1/dashboards/
   * @param dashboardCreate Parameter `dashboardCreate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public createDashboardApiV1DashboardsPost(
    dashboardCreate: DashboardCreate,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<DashboardResponse>;
  public createDashboardApiV1DashboardsPost(
    dashboardCreate: DashboardCreate,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<DashboardResponse>>;
  public createDashboardApiV1DashboardsPost(
    dashboardCreate: DashboardCreate,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<DashboardResponse>>;
  public createDashboardApiV1DashboardsPost(
    dashboardCreate: DashboardCreate,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (dashboardCreate === null || dashboardCreate === undefined) {
      throw new Error(
        'Required parameter dashboardCreate was null or undefined when calling createDashboardApiV1DashboardsPost.',
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

    const localVarPath = `/api/v1/dashboards/`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<DashboardResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: dashboardCreate,
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
   * Create Widget
   * Add a widget to the dashboard with Dry-Run Validation.
   * @endpoint post /api/v1/dashboards/{dashboard_id}/widgets
   * @param dashboardId Parameter `dashboardId`.
   * @param widgetIn Parameter `widgetIn`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public createWidgetApiV1DashboardsDashboardIdWidgetsPost(
    dashboardId: string,
    widgetIn: WidgetIn,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<WidgetResponse>;
  public createWidgetApiV1DashboardsDashboardIdWidgetsPost(
    dashboardId: string,
    widgetIn: WidgetIn,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<WidgetResponse>>;
  public createWidgetApiV1DashboardsDashboardIdWidgetsPost(
    dashboardId: string,
    widgetIn: WidgetIn,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<WidgetResponse>>;
  public createWidgetApiV1DashboardsDashboardIdWidgetsPost(
    dashboardId: string,
    widgetIn: WidgetIn,
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
    if (dashboardId === null || dashboardId === undefined) {
      throw new Error(
        'Required parameter dashboardId was null or undefined when calling createWidgetApiV1DashboardsDashboardIdWidgetsPost.',
      );
    }
    if (widgetIn === null || widgetIn === undefined) {
      throw new Error(
        'Required parameter widgetIn was null or undefined when calling createWidgetApiV1DashboardsDashboardIdWidgetsPost.',
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

    const localVarPath = `/api/v1/dashboards/${this.configuration.encodeParam({ name: 'dashboardId', value: dashboardId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/widgets`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<WidgetResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: widgetIn,
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
   * Delete Dashboard
   * Delete dashboard (and cascades to widgets and shares). Only owner can delete.
   * @endpoint delete /api/v1/dashboards/{dashboard_id}
   * @param dashboardId Parameter `dashboardId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public deleteDashboardApiV1DashboardsDashboardIdDelete(
    dashboardId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown>;
  public deleteDashboardApiV1DashboardsDashboardIdDelete(
    dashboardId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<unknown>>;
  public deleteDashboardApiV1DashboardsDashboardIdDelete(
    dashboardId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<unknown>>;
  public deleteDashboardApiV1DashboardsDashboardIdDelete(
    dashboardId: string,
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
    if (dashboardId === null || dashboardId === undefined) {
      throw new Error(
        'Required parameter dashboardId was null or undefined when calling deleteDashboardApiV1DashboardsDashboardIdDelete.',
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

    const localVarPath = `/api/v1/dashboards/${this.configuration.encodeParam({ name: 'dashboardId', value: dashboardId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<unknown>(this.httpClient, 'delete', `${basePath}${localVarPath}`, {
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

  /**
   * Delete Dashboard Share
   * Revokes a dashboard share. Only the dashboard owner can revoke shares.  Args:     dashboard_id (UUID): Target dashboard ID.     share_id (UUID): Specific share record ID to delete.     current_user (User): Authenticated owner.     db (AsyncSession): Database session.     accept_language (Optional[str]): Language preference header.
   * @endpoint delete /api/v1/dashboards/{dashboard_id}/shares/{share_id}
   * @param dashboardId Parameter `dashboardId`.
   * @param shareId Parameter `shareId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public deleteDashboardShareApiV1DashboardsDashboardIdSharesShareIdDelete(
    dashboardId: string,
    shareId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown>;
  public deleteDashboardShareApiV1DashboardsDashboardIdSharesShareIdDelete(
    dashboardId: string,
    shareId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<unknown>>;
  public deleteDashboardShareApiV1DashboardsDashboardIdSharesShareIdDelete(
    dashboardId: string,
    shareId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<unknown>>;
  public deleteDashboardShareApiV1DashboardsDashboardIdSharesShareIdDelete(
    dashboardId: string,
    shareId: string,
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
    if (dashboardId === null || dashboardId === undefined) {
      throw new Error(
        'Required parameter dashboardId was null or undefined when calling deleteDashboardShareApiV1DashboardsDashboardIdSharesShareIdDelete.',
      );
    }
    if (shareId === null || shareId === undefined) {
      throw new Error(
        'Required parameter shareId was null or undefined when calling deleteDashboardShareApiV1DashboardsDashboardIdSharesShareIdDelete.',
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

    const localVarPath = `/api/v1/dashboards/${this.configuration.encodeParam({ name: 'dashboardId', value: dashboardId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/shares/${this.configuration.encodeParam({ name: 'shareId', value: shareId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<unknown>(this.httpClient, 'delete', `${basePath}${localVarPath}`, {
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

  /**
   * Delete Widget
   * Delete a widget from a dashboard.
   * @endpoint delete /api/v1/dashboards/widgets/{widget_id}
   * @param widgetId Parameter `widgetId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(
    widgetId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown>;
  public deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(
    widgetId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<unknown>>;
  public deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(
    widgetId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<unknown>>;
  public deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(
    widgetId: string,
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
    if (widgetId === null || widgetId === undefined) {
      throw new Error(
        'Required parameter widgetId was null or undefined when calling deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete.',
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

    const localVarPath = `/api/v1/dashboards/widgets/${this.configuration.encodeParam({ name: 'widgetId', value: widgetId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<unknown>(this.httpClient, 'delete', `${basePath}${localVarPath}`, {
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

  /**
   * Export Dashboard
   * Exports dashboard layout, configuration, and data snapshot in JSON or CSV format.  Args:     dashboard_id (UUID): Target dashboard ID.     current_user (User): Authenticated user requesting export.     db (AsyncSession): Database session.     format (str): Export format (\&#39;json\&#39; or \&#39;csv\&#39;).     accept_language (Optional[str]): Language preference header.  Returns:     Response: File download stream with appropriate media type.
   * @endpoint get /api/v1/dashboards/{dashboard_id}/export
   * @param dashboardId Parameter `dashboardId`.
   * @param format Parameter `format`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public exportDashboardApiV1DashboardsDashboardIdExportGet(
    dashboardId: string,
    format?: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown>;
  public exportDashboardApiV1DashboardsDashboardIdExportGet(
    dashboardId: string,
    format?: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<unknown>>;
  public exportDashboardApiV1DashboardsDashboardIdExportGet(
    dashboardId: string,
    format?: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<unknown>>;
  public exportDashboardApiV1DashboardsDashboardIdExportGet(
    dashboardId: string,
    format?: string,
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
    if (dashboardId === null || dashboardId === undefined) {
      throw new Error(
        'Required parameter dashboardId was null or undefined when calling exportDashboardApiV1DashboardsDashboardIdExportGet.',
      );
    }

    let localVarQueryParameters = new OpenApiHttpParams(this.encoder);

    localVarQueryParameters = this.addToHttpParams(
      localVarQueryParameters,
      'format',
      format,
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

    const localVarPath = `/api/v1/dashboards/${this.configuration.encodeParam({ name: 'dashboardId', value: dashboardId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/export`;
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

  /**
   * Export Dashboard Pdf
   * Exports dashboard layout, clinical metadata, and data snapshot formatted as a PDF report.  Args:     dashboard_id (UUID): Target dashboard ID.     current_user (User): Authenticated user requesting export.     db (AsyncSession): Database session.     accept_language (Optional[str]): Language preference header.  Returns:     Response: Binary stream formatted as an application/pdf document.
   * @endpoint get /api/v1/dashboards/{dashboard_id}/export/pdf
   * @param dashboardId Parameter `dashboardId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public exportDashboardPdfApiV1DashboardsDashboardIdExportPdfGet(
    dashboardId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown>;
  public exportDashboardPdfApiV1DashboardsDashboardIdExportPdfGet(
    dashboardId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<unknown>>;
  public exportDashboardPdfApiV1DashboardsDashboardIdExportPdfGet(
    dashboardId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<unknown>>;
  public exportDashboardPdfApiV1DashboardsDashboardIdExportPdfGet(
    dashboardId: string,
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
    if (dashboardId === null || dashboardId === undefined) {
      throw new Error(
        'Required parameter dashboardId was null or undefined when calling exportDashboardPdfApiV1DashboardsDashboardIdExportPdfGet.',
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

    const localVarPath = `/api/v1/dashboards/${this.configuration.encodeParam({ name: 'dashboardId', value: dashboardId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/export/pdf`;
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

  /**
   * Export Widget
   * Exports an individual widget configuration and its analytical data snapshot.  Args:     dashboard_id (UUID): Target dashboard ID.     widget_id (UUID): Target widget ID within the dashboard.     current_user (User): Authenticated user requesting export.     db (AsyncSession): PostgreSQL async database session.     format (str): Export format (\&#39;json\&#39; or \&#39;csv\&#39;). Defaults to \&#39;json\&#39;.     accept_language (Optional[str]): Language preference header.  Returns:     Response: Streaming file download with appropriate MIME type and Content-Disposition.  Raises:     HTTPException: 404 if dashboard or widget not found or access denied.
   * @endpoint get /api/v1/dashboards/{dashboard_id}/widgets/{widget_id}/export
   * @param dashboardId Parameter `dashboardId`.
   * @param widgetId Parameter `widgetId`.
   * @param format Parameter `format`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public exportWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdExportGet(
    dashboardId: string,
    widgetId: string,
    format?: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown>;
  public exportWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdExportGet(
    dashboardId: string,
    widgetId: string,
    format?: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<unknown>>;
  public exportWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdExportGet(
    dashboardId: string,
    widgetId: string,
    format?: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<unknown>>;
  public exportWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdExportGet(
    dashboardId: string,
    widgetId: string,
    format?: string,
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
    if (dashboardId === null || dashboardId === undefined) {
      throw new Error(
        'Required parameter dashboardId was null or undefined when calling exportWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdExportGet.',
      );
    }
    if (widgetId === null || widgetId === undefined) {
      throw new Error(
        'Required parameter widgetId was null or undefined when calling exportWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdExportGet.',
      );
    }

    let localVarQueryParameters = new OpenApiHttpParams(this.encoder);

    localVarQueryParameters = this.addToHttpParams(
      localVarQueryParameters,
      'format',
      format,
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

    const localVarPath = `/api/v1/dashboards/${this.configuration.encodeParam({ name: 'dashboardId', value: dashboardId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/widgets/${this.configuration.encodeParam({ name: 'widgetId', value: widgetId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/export`;
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

  /**
   * Get Dashboard
   * Get a specific dashboard details.
   * @endpoint get /api/v1/dashboards/{dashboard_id}
   * @param dashboardId Parameter `dashboardId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public getDashboardApiV1DashboardsDashboardIdGet(
    dashboardId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<DashboardResponse>;
  public getDashboardApiV1DashboardsDashboardIdGet(
    dashboardId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<DashboardResponse>>;
  public getDashboardApiV1DashboardsDashboardIdGet(
    dashboardId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<DashboardResponse>>;
  public getDashboardApiV1DashboardsDashboardIdGet(
    dashboardId: string,
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
    if (dashboardId === null || dashboardId === undefined) {
      throw new Error(
        'Required parameter dashboardId was null or undefined when calling getDashboardApiV1DashboardsDashboardIdGet.',
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

    const localVarPath = `/api/v1/dashboards/${this.configuration.encodeParam({ name: 'dashboardId', value: dashboardId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<DashboardResponse>(
      this.httpClient,
      'get',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
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
   * List Dashboard Shares
   * Lists all active shares on a dashboard. Accessible to owners and collaborators.  Args:     dashboard_id (UUID): Target dashboard ID.     current_user (User): Authenticated user with access.     db (AsyncSession): Database session.     accept_language (Optional[str]): Language preference header.  Returns:     List[DashboardShareResponse]: List of active shares.
   * @endpoint get /api/v1/dashboards/{dashboard_id}/shares
   * @param dashboardId Parameter `dashboardId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public listDashboardSharesApiV1DashboardsDashboardIdSharesGet(
    dashboardId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<DashboardShareResponse[]>;
  public listDashboardSharesApiV1DashboardsDashboardIdSharesGet(
    dashboardId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<DashboardShareResponse[]>>;
  public listDashboardSharesApiV1DashboardsDashboardIdSharesGet(
    dashboardId: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<DashboardShareResponse[]>>;
  public listDashboardSharesApiV1DashboardsDashboardIdSharesGet(
    dashboardId: string,
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
    if (dashboardId === null || dashboardId === undefined) {
      throw new Error(
        'Required parameter dashboardId was null or undefined when calling listDashboardSharesApiV1DashboardsDashboardIdSharesGet.',
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

    const localVarPath = `/api/v1/dashboards/${this.configuration.encodeParam({ name: 'dashboardId', value: dashboardId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/shares`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<DashboardShareResponse[]>(
      this.httpClient,
      'get',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
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
   * List Dashboards
   * List all dashboards owned by or shared with the current user.
   * @endpoint get /api/v1/dashboards
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public listDashboardsApiV1DashboardsGet(
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<DashboardResponse[]>;
  public listDashboardsApiV1DashboardsGet(
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<DashboardResponse[]>>;
  public listDashboardsApiV1DashboardsGet(
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<DashboardResponse[]>>;
  public listDashboardsApiV1DashboardsGet(
    token?: string,
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
      'token',
      token,
      QueryParamStyle.Form,
      true,
    );

    let localVarHeaders = this.defaultHeaders;

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

    const localVarPath = `/api/v1/dashboards`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<DashboardResponse[]>(
      this.httpClient,
      'get',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
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
   * List Dashboards
   * List all dashboards owned by or shared with the current user.
   * @endpoint get /api/v1/dashboards/
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public listDashboardsApiV1DashboardsGet_1(
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<DashboardResponse[]>;
  public listDashboardsApiV1DashboardsGet_1(
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<DashboardResponse[]>>;
  public listDashboardsApiV1DashboardsGet_1(
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<DashboardResponse[]>>;
  public listDashboardsApiV1DashboardsGet_1(
    token?: string,
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
      'token',
      token,
      QueryParamStyle.Form,
      true,
    );

    let localVarHeaders = this.defaultHeaders;

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

    const localVarPath = `/api/v1/dashboards/`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<DashboardResponse[]>(
      this.httpClient,
      'get',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
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
   * Reorder Widgets
   * Bulk update widget positions and groups. Used for Drag-and-Drop persistence.
   * @endpoint post /api/v1/dashboards/{dashboard_id}/reorder
   * @param dashboardId Parameter `dashboardId`.
   * @param widgetReorderRequest Parameter `widgetReorderRequest`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public reorderWidgetsApiV1DashboardsDashboardIdReorderPost(
    dashboardId: string,
    widgetReorderRequest: WidgetReorderRequest,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<Record<string, unknown>>;
  public reorderWidgetsApiV1DashboardsDashboardIdReorderPost(
    dashboardId: string,
    widgetReorderRequest: WidgetReorderRequest,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<Record<string, unknown>>>;
  public reorderWidgetsApiV1DashboardsDashboardIdReorderPost(
    dashboardId: string,
    widgetReorderRequest: WidgetReorderRequest,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<Record<string, unknown>>>;
  public reorderWidgetsApiV1DashboardsDashboardIdReorderPost(
    dashboardId: string,
    widgetReorderRequest: WidgetReorderRequest,
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
    if (dashboardId === null || dashboardId === undefined) {
      throw new Error(
        'Required parameter dashboardId was null or undefined when calling reorderWidgetsApiV1DashboardsDashboardIdReorderPost.',
      );
    }
    if (widgetReorderRequest === null || widgetReorderRequest === undefined) {
      throw new Error(
        'Required parameter widgetReorderRequest was null or undefined when calling reorderWidgetsApiV1DashboardsDashboardIdReorderPost.',
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

    const localVarPath = `/api/v1/dashboards/${this.configuration.encodeParam({ name: 'dashboardId', value: dashboardId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/reorder`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<Record<string, unknown>>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: widgetReorderRequest,
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
   * Restore Default Dashboard
   * Re-creates the standard \&#39;Hospital Command Center\&#39; dashboard. If the dashboard already exists, creates a copy with a suffix to prevent data loss. Populates the dashboard with all currently active templates in the registry.
   * @endpoint post /api/v1/dashboards/restore-defaults
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost(
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<DashboardResponse>;
  public restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost(
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<DashboardResponse>>;
  public restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost(
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<DashboardResponse>>;
  public restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost(
    token?: string,
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
      'token',
      token,
      QueryParamStyle.Form,
      true,
    );

    let localVarHeaders = this.defaultHeaders;

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

    const localVarPath = `/api/v1/dashboards/restore-defaults`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<DashboardResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
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
   * Share Dashboard
   * Shares a dashboard with another user by email. Only the dashboard owner can share.  Args:     dashboard_id (UUID): Target dashboard ID.     share_in (DashboardShareCreate): Email and permission level (\&#39;VIEW\&#39; or \&#39;EDIT\&#39;).     current_user (User): Authenticated user (must be owner).     db (AsyncSession): Database session.     accept_language (Optional[str]): Language preference header.  Returns:     DashboardShareResponse: Details of created or updated share.
   * @endpoint post /api/v1/dashboards/{dashboard_id}/shares
   * @param dashboardId Parameter `dashboardId`.
   * @param dashboardShareCreate Parameter `dashboardShareCreate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public shareDashboardApiV1DashboardsDashboardIdSharesPost(
    dashboardId: string,
    dashboardShareCreate: DashboardShareCreate,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<DashboardShareResponse>;
  public shareDashboardApiV1DashboardsDashboardIdSharesPost(
    dashboardId: string,
    dashboardShareCreate: DashboardShareCreate,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<DashboardShareResponse>>;
  public shareDashboardApiV1DashboardsDashboardIdSharesPost(
    dashboardId: string,
    dashboardShareCreate: DashboardShareCreate,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<DashboardShareResponse>>;
  public shareDashboardApiV1DashboardsDashboardIdSharesPost(
    dashboardId: string,
    dashboardShareCreate: DashboardShareCreate,
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
    if (dashboardId === null || dashboardId === undefined) {
      throw new Error(
        'Required parameter dashboardId was null or undefined when calling shareDashboardApiV1DashboardsDashboardIdSharesPost.',
      );
    }
    if (dashboardShareCreate === null || dashboardShareCreate === undefined) {
      throw new Error(
        'Required parameter dashboardShareCreate was null or undefined when calling shareDashboardApiV1DashboardsDashboardIdSharesPost.',
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

    const localVarPath = `/api/v1/dashboards/${this.configuration.encodeParam({ name: 'dashboardId', value: dashboardId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/shares`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<DashboardShareResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: dashboardShareCreate,
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
   * Update Dashboard
   * Rename a dashboard.
   * @endpoint put /api/v1/dashboards/{dashboard_id}
   * @param dashboardId Parameter `dashboardId`.
   * @param dashboardCreate Parameter `dashboardCreate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public updateDashboardApiV1DashboardsDashboardIdPut(
    dashboardId: string,
    dashboardCreate: DashboardCreate,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<DashboardResponse>;
  public updateDashboardApiV1DashboardsDashboardIdPut(
    dashboardId: string,
    dashboardCreate: DashboardCreate,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<DashboardResponse>>;
  public updateDashboardApiV1DashboardsDashboardIdPut(
    dashboardId: string,
    dashboardCreate: DashboardCreate,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<DashboardResponse>>;
  public updateDashboardApiV1DashboardsDashboardIdPut(
    dashboardId: string,
    dashboardCreate: DashboardCreate,
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
    if (dashboardId === null || dashboardId === undefined) {
      throw new Error(
        'Required parameter dashboardId was null or undefined when calling updateDashboardApiV1DashboardsDashboardIdPut.',
      );
    }
    if (dashboardCreate === null || dashboardCreate === undefined) {
      throw new Error(
        'Required parameter dashboardCreate was null or undefined when calling updateDashboardApiV1DashboardsDashboardIdPut.',
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

    const localVarPath = `/api/v1/dashboards/${this.configuration.encodeParam({ name: 'dashboardId', value: dashboardId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<DashboardResponse>(
      this.httpClient,
      'put',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: dashboardCreate,
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
   * Update Widget
   * Update widget configuration (e.g., resize, change query) with Dry-Run.
   * @endpoint put /api/v1/dashboards/widgets/{widget_id}
   * @param widgetId Parameter `widgetId`.
   * @param widgetUpdate Parameter `widgetUpdate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public updateWidgetApiV1DashboardsWidgetsWidgetIdPut(
    widgetId: string,
    widgetUpdate: WidgetUpdate,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<WidgetResponse>;
  public updateWidgetApiV1DashboardsWidgetsWidgetIdPut(
    widgetId: string,
    widgetUpdate: WidgetUpdate,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<WidgetResponse>>;
  public updateWidgetApiV1DashboardsWidgetsWidgetIdPut(
    widgetId: string,
    widgetUpdate: WidgetUpdate,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<WidgetResponse>>;
  public updateWidgetApiV1DashboardsWidgetsWidgetIdPut(
    widgetId: string,
    widgetUpdate: WidgetUpdate,
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
    if (widgetId === null || widgetId === undefined) {
      throw new Error(
        'Required parameter widgetId was null or undefined when calling updateWidgetApiV1DashboardsWidgetsWidgetIdPut.',
      );
    }
    if (widgetUpdate === null || widgetUpdate === undefined) {
      throw new Error(
        'Required parameter widgetUpdate was null or undefined when calling updateWidgetApiV1DashboardsWidgetsWidgetIdPut.',
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

    const localVarPath = `/api/v1/dashboards/widgets/${this.configuration.encodeParam({ name: 'widgetId', value: widgetId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<WidgetResponse>(
      this.httpClient,
      'put',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: widgetUpdate,
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
