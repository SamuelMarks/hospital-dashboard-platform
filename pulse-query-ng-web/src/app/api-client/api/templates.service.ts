/**
 * @fileoverview Generated OpenAPI Angular service for Hospital Analytics Platform.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse, HttpEvent, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { OpenApiHttpParams, QueryParamStyle } from '../query.params';

import { TemplateCreate } from '../model/template-create';
import { TemplateResponse } from '../model/template-response';
import { TemplateUpdate } from '../model/template-update';

import { BASE_PATH } from '../variables';
import { Configuration } from '../configuration';
import { BaseService } from '../api.base.service';

/**
 * Injectable OpenAPI client service.
 */
@Injectable({
  providedIn: 'root',
})
export class TemplatesService extends BaseService {
  /** Angular HttpClient used to dispatch REST requests. */
  protected readonly httpClient = inject(HttpClient);

  /** Initializes the service with optional base path and OpenAPI configuration. */
  constructor() {
    super(inject(BASE_PATH, { optional: true }), inject(Configuration, { optional: true }));
  }

  /**
   * Create Template
   * Register a new analytics template in the system.  Args:     template_in (TemplateCreate): Validated template payload.     db (AsyncSession): Database session.     current_user (User): Authenticated user.  Returns:     WidgetTemplate: The persisted template object.
   * @endpoint post /api/v1/templates/
   * @param templateCreate Parameter `templateCreate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public createTemplateApiV1TemplatesPost(
    templateCreate: TemplateCreate,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<TemplateResponse>;
  public createTemplateApiV1TemplatesPost(
    templateCreate: TemplateCreate,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<TemplateResponse>>;
  public createTemplateApiV1TemplatesPost(
    templateCreate: TemplateCreate,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<TemplateResponse>>;
  public createTemplateApiV1TemplatesPost(
    templateCreate: TemplateCreate,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (templateCreate === null || templateCreate === undefined) {
      throw new Error(
        'Required parameter templateCreate was null or undefined when calling createTemplateApiV1TemplatesPost.',
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

    const localVarPath = `/api/v1/templates/`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<TemplateResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: templateCreate,
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
   * Delete Template
   * Hard delete a template from the registry.  Args:     template_id (UUID): The unique ID of the template.     db (AsyncSession): Database session.     current_user (User): Authenticated user.  Raises:     HTTPException: 404 if not found.
   * @endpoint delete /api/v1/templates/{template_id}
   * @param templateId Parameter `templateId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public deleteTemplateApiV1TemplatesTemplateIdDelete(
    templateId: string,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown>;
  public deleteTemplateApiV1TemplatesTemplateIdDelete(
    templateId: string,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<unknown>>;
  public deleteTemplateApiV1TemplatesTemplateIdDelete(
    templateId: string,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<unknown>>;
  public deleteTemplateApiV1TemplatesTemplateIdDelete(
    templateId: string,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (templateId === null || templateId === undefined) {
      throw new Error(
        'Required parameter templateId was null or undefined when calling deleteTemplateApiV1TemplatesTemplateIdDelete.',
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

    const localVarPath = `/api/v1/templates/${this.configuration.encodeParam({ name: 'templateId', value: templateId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}`;
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
   * Get Template
   * Retrieve details for a specific template.  Args:     template_id (UUID): The unique ID of the template.     db (AsyncSession): Database session.     current_user (User): Authenticated user.  Returns:     WidgetTemplate: The requested template.  Raises:     HTTPException: 404 if not found.
   * @endpoint get /api/v1/templates/{template_id}
   * @param templateId Parameter `templateId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public getTemplateApiV1TemplatesTemplateIdGet(
    templateId: string,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<TemplateResponse>;
  public getTemplateApiV1TemplatesTemplateIdGet(
    templateId: string,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<TemplateResponse>>;
  public getTemplateApiV1TemplatesTemplateIdGet(
    templateId: string,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<TemplateResponse>>;
  public getTemplateApiV1TemplatesTemplateIdGet(
    templateId: string,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (templateId === null || templateId === undefined) {
      throw new Error(
        'Required parameter templateId was null or undefined when calling getTemplateApiV1TemplatesTemplateIdGet.',
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

    const localVarPath = `/api/v1/templates/${this.configuration.encodeParam({ name: 'templateId', value: templateId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<TemplateResponse>(
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
   * List Templates
   * Retrieve a list of available widget templates with filtering and pagination.  Args:     db (AsyncSession): Database session dependency.     category (Optional[str]): Filter templates by category name.     search (Optional[str]): Case-insensitive search term for title or description.     limit (int): Maximum number of records to return.     current_user (User): Authenticated user dependency.  Returns:     List[WidgetTemplate]: Filtered list of templates.
   * @endpoint get /api/v1/templates/
   * @param category Filter templates by category
   * @param search Search title or description
   * @param limit Max records to return
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public listTemplatesApiV1TemplatesGet(
    category?: string,
    search?: string,
    limit?: number,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<TemplateResponse[]>;
  public listTemplatesApiV1TemplatesGet(
    category?: string,
    search?: string,
    limit?: number,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<TemplateResponse[]>>;
  public listTemplatesApiV1TemplatesGet(
    category?: string,
    search?: string,
    limit?: number,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<TemplateResponse[]>>;
  public listTemplatesApiV1TemplatesGet(
    category?: string,
    search?: string,
    limit?: number,
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
      'category',
      category,
      QueryParamStyle.Form,
      true,
    );

    localVarQueryParameters = this.addToHttpParams(
      localVarQueryParameters,
      'search',
      search,
      QueryParamStyle.Form,
      true,
    );

    localVarQueryParameters = this.addToHttpParams(
      localVarQueryParameters,
      'limit',
      limit,
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

    const localVarPath = `/api/v1/templates/`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<TemplateResponse[]>(
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
   * Update Template
   * Update an existing template\&#39;s definition.  Args:     template_id (UUID): The unique ID of the template.     template_in (TemplateUpdate): Partial update payload.     db (AsyncSession): Database session.     current_user (User): Authenticated user.  Returns:     WidgetTemplate: The updated template.  Raises:     HTTPException: 404 if not found.
   * @endpoint put /api/v1/templates/{template_id}
   * @param templateId Parameter `templateId`.
   * @param templateUpdate Parameter `templateUpdate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public updateTemplateApiV1TemplatesTemplateIdPut(
    templateId: string,
    templateUpdate: TemplateUpdate,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<TemplateResponse>;
  public updateTemplateApiV1TemplatesTemplateIdPut(
    templateId: string,
    templateUpdate: TemplateUpdate,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<TemplateResponse>>;
  public updateTemplateApiV1TemplatesTemplateIdPut(
    templateId: string,
    templateUpdate: TemplateUpdate,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<TemplateResponse>>;
  public updateTemplateApiV1TemplatesTemplateIdPut(
    templateId: string,
    templateUpdate: TemplateUpdate,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (templateId === null || templateId === undefined) {
      throw new Error(
        'Required parameter templateId was null or undefined when calling updateTemplateApiV1TemplatesTemplateIdPut.',
      );
    }
    if (templateUpdate === null || templateUpdate === undefined) {
      throw new Error(
        'Required parameter templateUpdate was null or undefined when calling updateTemplateApiV1TemplatesTemplateIdPut.',
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

    const localVarPath = `/api/v1/templates/${this.configuration.encodeParam({ name: 'templateId', value: templateId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<TemplateResponse>(
      this.httpClient,
      'put',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: templateUpdate,
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
