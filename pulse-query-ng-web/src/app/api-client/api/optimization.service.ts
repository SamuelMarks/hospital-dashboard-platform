/**
 * @fileoverview Generated OpenAPI Angular service for Hospital Analytics Platform.
 */

import { Service, inject } from '@angular/core';
import { HttpClient, HttpResponse, HttpEvent, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';

import { InstitutionProfileSchema } from '../model/institution-profile-schema';
import { ModelCompendiumEntrySchema } from '../model/model-compendium-entry-schema';
import { OptimizationEvaluationSummaryResponse } from '../model/optimization-evaluation-summary-response';
import { OptimizationIterationRequest } from '../model/optimization-iteration-request';
import { OptimizationIterationResponse } from '../model/optimization-iteration-response';
import { OptimizationSessionCreate } from '../model/optimization-session-create';
import { OptimizationSessionResponse } from '../model/optimization-session-response';
import { OptimizationSolutionPayload } from '../model/optimization-solution-payload';
import { OptimizationSolveRequest } from '../model/optimization-solve-request';
import { OptimizationSurveyCreate } from '../model/optimization-survey-create';
import { OptimizationSurveyResponse } from '../model/optimization-survey-response';
import { QuickActionDefinitionSchema } from '../model/quick-action-definition-schema';
import { QuickActionExecutionRequest } from '../model/quick-action-execution-request';
import { QuickActionExecutionResponse } from '../model/quick-action-execution-response';

import { BASE_PATH } from '../variables';
import { Configuration } from '../configuration';
import { BaseService } from '../api.base.service';
import { OpenApiHttpParams, QueryParamStyle } from '../query.params';

/**
 * Injectable OpenAPI client service.
 */
@Service()
export class OptimizationService extends BaseService {
  /** Angular HttpClient used to dispatch REST requests. */
  protected readonly httpClient = inject(HttpClient);

  /** Initializes the service with optional base path and OpenAPI configuration. */
  constructor() {
    super(inject(BASE_PATH, { optional: true }), inject(Configuration, { optional: true }));
  }

  /**
   * Create Optimization Session
   * Creates a new iterative Hospital Optimization session for Use Case 1, 2, or 3.  Args:     payload (OptimizationSessionCreate): Session creation parameters.     db (AsyncSession): Active PostgreSQL async session.     current_user (User): Authenticated hospital user.  Returns:     OptimizationSessionResponse: Created session state with initial MPAX baseline solution.
   * @endpoint post /api/v1/optimization/sessions
   * @param optimizationSessionCreate Parameter `optimizationSessionCreate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public createOptimizationSessionApiV1OptimizationSessionsPost(
    optimizationSessionCreate: OptimizationSessionCreate,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<OptimizationSessionResponse>;
  public createOptimizationSessionApiV1OptimizationSessionsPost(
    optimizationSessionCreate: OptimizationSessionCreate,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<OptimizationSessionResponse>>;
  public createOptimizationSessionApiV1OptimizationSessionsPost(
    optimizationSessionCreate: OptimizationSessionCreate,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<OptimizationSessionResponse>>;
  public createOptimizationSessionApiV1OptimizationSessionsPost(
    optimizationSessionCreate: OptimizationSessionCreate,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (optimizationSessionCreate === null || optimizationSessionCreate === undefined) {
      throw new Error(
        'Required parameter optimizationSessionCreate was null or undefined when calling createOptimizationSessionApiV1OptimizationSessionsPost.',
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

    const localVarPath = `/api/v1/optimization/sessions`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<OptimizationSessionResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: optimizationSessionCreate,
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
   * Delete Optimization Session
   * Deletes an iterative Hospital Optimization session owned by the authenticated user.  Args:     session_id (str): Target session UUID string.     db (AsyncSession): Active PostgreSQL async session.     current_user (User): Authenticated hospital user.  Returns:     dict[str, str]: Deletion confirmation dictionary.
   * @endpoint delete /api/v1/optimization/sessions/{session_id}
   * @param sessionId Parameter `sessionId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public deleteOptimizationSessionApiV1OptimizationSessionsSessionIdDelete(
    sessionId: string,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<Record<string, string | null>>;
  public deleteOptimizationSessionApiV1OptimizationSessionsSessionIdDelete(
    sessionId: string,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<Record<string, string | null>>>;
  public deleteOptimizationSessionApiV1OptimizationSessionsSessionIdDelete(
    sessionId: string,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<Record<string, string | null>>>;
  public deleteOptimizationSessionApiV1OptimizationSessionsSessionIdDelete(
    sessionId: string,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (sessionId === null || sessionId === undefined) {
      throw new Error(
        'Required parameter sessionId was null or undefined when calling deleteOptimizationSessionApiV1OptimizationSessionsSessionIdDelete.',
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

    const localVarPath = `/api/v1/optimization/sessions/${this.configuration.encodeParam({ name: 'sessionId', value: sessionId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: undefined })}`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<Record<string, string | null>>(
      this.httpClient,
      'delete',
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
   * Execute Optimization Quick Action
   * Executes a deterministic Quick Action (&#x60;patient_days_by_unit&#x60;, &#x60;patient_days_by_service&#x60;, &#x60;combined_analysis&#x60;, &#x60;summary_statistics&#x60;, &#x60;optimize_service_units&#x60;, &#x60;smooth_surgical_schedule&#x60;, or &#x60;optimize_nurse_staffing&#x60;).  Args:     action_id (str): Quick Action identifier.     request (QuickActionExecutionRequest): Institution and use-case request parameters.     current_user (User): Authenticated hospital user.  Returns:     QuickActionExecutionResponse: Tabular rows and optional solved MPAX payload.
   * @endpoint post /api/v1/optimization/quick-actions/{action_id}
   * @param actionId Parameter `actionId`.
   * @param quickActionExecutionRequest Parameter `quickActionExecutionRequest`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public executeOptimizationQuickActionApiV1OptimizationQuickActionsActionIdPost(
    actionId: string,
    quickActionExecutionRequest: QuickActionExecutionRequest,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<QuickActionExecutionResponse>;
  public executeOptimizationQuickActionApiV1OptimizationQuickActionsActionIdPost(
    actionId: string,
    quickActionExecutionRequest: QuickActionExecutionRequest,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<QuickActionExecutionResponse>>;
  public executeOptimizationQuickActionApiV1OptimizationQuickActionsActionIdPost(
    actionId: string,
    quickActionExecutionRequest: QuickActionExecutionRequest,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<QuickActionExecutionResponse>>;
  public executeOptimizationQuickActionApiV1OptimizationQuickActionsActionIdPost(
    actionId: string,
    quickActionExecutionRequest: QuickActionExecutionRequest,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (actionId === null || actionId === undefined) {
      throw new Error(
        'Required parameter actionId was null or undefined when calling executeOptimizationQuickActionApiV1OptimizationQuickActionsActionIdPost.',
      );
    }
    if (quickActionExecutionRequest === null || quickActionExecutionRequest === undefined) {
      throw new Error(
        'Required parameter quickActionExecutionRequest was null or undefined when calling executeOptimizationQuickActionApiV1OptimizationQuickActionsActionIdPost.',
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

    const localVarPath = `/api/v1/optimization/quick-actions/${this.configuration.encodeParam({ name: 'actionId', value: actionId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: undefined })}`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<QuickActionExecutionResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: quickActionExecutionRequest,
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
   * Get Optimization Evaluation Summary
   * Returns aggregated quantitative (DES Expert Baseline gap) and qualitative (User Survey) evaluation metrics across all hospital optimization sessions.  Args:     db (AsyncSession): Active PostgreSQL async session.     current_user (User): Authenticated hospital user.  Returns:     OptimizationEvaluationSummaryResponse: Aggregated quantitative and qualitative metrics.
   * @endpoint get /api/v1/optimization/surveys/summary
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public getOptimizationEvaluationSummaryApiV1OptimizationSurveysSummaryGet(
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<OptimizationEvaluationSummaryResponse>;
  public getOptimizationEvaluationSummaryApiV1OptimizationSurveysSummaryGet(
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<OptimizationEvaluationSummaryResponse>>;
  public getOptimizationEvaluationSummaryApiV1OptimizationSurveysSummaryGet(
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<OptimizationEvaluationSummaryResponse>>;
  public getOptimizationEvaluationSummaryApiV1OptimizationSurveysSummaryGet(
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

    const localVarPath = `/api/v1/optimization/surveys/summary`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<OptimizationEvaluationSummaryResponse>(
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
   * Get Optimization Institutions
   * Lists all partner hospital institution profiles and their operational baseline parameters.  Args:     current_user (User): Authenticated hospital user.  Returns:     list[InstitutionProfileSchema]: Partner hospital profiles.
   * @endpoint get /api/v1/optimization/institutions
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public getOptimizationInstitutionsApiV1OptimizationInstitutionsGet(
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<InstitutionProfileSchema[]>;
  public getOptimizationInstitutionsApiV1OptimizationInstitutionsGet(
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<InstitutionProfileSchema[]>>;
  public getOptimizationInstitutionsApiV1OptimizationInstitutionsGet(
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<InstitutionProfileSchema[]>>;
  public getOptimizationInstitutionsApiV1OptimizationInstitutionsGet(
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

    const localVarPath = `/api/v1/optimization/institutions`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<InstitutionProfileSchema[]>(
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
   * Get Optimization Model Compendium
   * Lists the compendium of out-of-the-box, JAX/TPU fine-tuned, and LiteRT on-device models.  Args:     current_user (User): Authenticated hospital user.  Returns:     list[ModelCompendiumEntrySchema]: Supported LLM and LiteRT models.
   * @endpoint get /api/v1/optimization/models
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public getOptimizationModelCompendiumApiV1OptimizationModelsGet(
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<ModelCompendiumEntrySchema[]>;
  public getOptimizationModelCompendiumApiV1OptimizationModelsGet(
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<ModelCompendiumEntrySchema[]>>;
  public getOptimizationModelCompendiumApiV1OptimizationModelsGet(
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<ModelCompendiumEntrySchema[]>>;
  public getOptimizationModelCompendiumApiV1OptimizationModelsGet(
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

    const localVarPath = `/api/v1/optimization/models`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<ModelCompendiumEntrySchema[]>(
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
   * Get Optimization Quick Actions
   * Lists Quick Action buttons available in the Hospital Optimization Workspace.  Args:     current_user (User): Authenticated hospital user.     use_case (str | None): Optional optimization use case filter.  Returns:     list[QuickActionDefinitionSchema]: Quick Action button definitions.
   * @endpoint get /api/v1/optimization/quick-actions
   * @param useCase Optional use case filter
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public getOptimizationQuickActionsApiV1OptimizationQuickActionsGet(
    useCase?: string,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<QuickActionDefinitionSchema[]>;
  public getOptimizationQuickActionsApiV1OptimizationQuickActionsGet(
    useCase?: string,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<QuickActionDefinitionSchema[]>>;
  public getOptimizationQuickActionsApiV1OptimizationQuickActionsGet(
    useCase?: string,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<QuickActionDefinitionSchema[]>>;
  public getOptimizationQuickActionsApiV1OptimizationQuickActionsGet(
    useCase?: string,
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
      'use_case',
      useCase,
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

    const localVarPath = `/api/v1/optimization/quick-actions`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<QuickActionDefinitionSchema[]>(
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
   * Get Optimization Session
   * Retrieves a specific Hospital Optimization session and its iteration history.  Args:     session_id (str): Target session UUID string.     db (AsyncSession): Active PostgreSQL async session.     current_user (User): Authenticated hospital user.  Returns:     OptimizationSessionResponse: Session state and chronological iteration history.
   * @endpoint get /api/v1/optimization/sessions/{session_id}
   * @param sessionId Parameter `sessionId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public getOptimizationSessionApiV1OptimizationSessionsSessionIdGet(
    sessionId: string,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<OptimizationSessionResponse>;
  public getOptimizationSessionApiV1OptimizationSessionsSessionIdGet(
    sessionId: string,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<OptimizationSessionResponse>>;
  public getOptimizationSessionApiV1OptimizationSessionsSessionIdGet(
    sessionId: string,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<OptimizationSessionResponse>>;
  public getOptimizationSessionApiV1OptimizationSessionsSessionIdGet(
    sessionId: string,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (sessionId === null || sessionId === undefined) {
      throw new Error(
        'Required parameter sessionId was null or undefined when calling getOptimizationSessionApiV1OptimizationSessionsSessionIdGet.',
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

    const localVarPath = `/api/v1/optimization/sessions/${this.configuration.encodeParam({ name: 'sessionId', value: sessionId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: undefined })}`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<OptimizationSessionResponse>(
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
   * Iterate Optimization Session
   * Submits a natural-language prompt or constraint update to an active optimization session, solves the updated JAX/MPAX model, and returns the clinical explanation + DES comparison.  Args:     session_id (str): Target optimization session UUID string.     request (OptimizationIterationRequest): Conversational turn request.     db (AsyncSession): Active PostgreSQL async session.     current_user (User): Authenticated hospital user.  Returns:     OptimizationIterationResponse: Completed turn with updated MPAX solution and explanation.
   * @endpoint post /api/v1/optimization/sessions/{session_id}/iterate
   * @param sessionId Parameter `sessionId`.
   * @param optimizationIterationRequest Parameter `optimizationIterationRequest`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public iterateOptimizationSessionApiV1OptimizationSessionsSessionIdIteratePost(
    sessionId: string,
    optimizationIterationRequest: OptimizationIterationRequest,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<OptimizationIterationResponse>;
  public iterateOptimizationSessionApiV1OptimizationSessionsSessionIdIteratePost(
    sessionId: string,
    optimizationIterationRequest: OptimizationIterationRequest,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<OptimizationIterationResponse>>;
  public iterateOptimizationSessionApiV1OptimizationSessionsSessionIdIteratePost(
    sessionId: string,
    optimizationIterationRequest: OptimizationIterationRequest,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<OptimizationIterationResponse>>;
  public iterateOptimizationSessionApiV1OptimizationSessionsSessionIdIteratePost(
    sessionId: string,
    optimizationIterationRequest: OptimizationIterationRequest,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (sessionId === null || sessionId === undefined) {
      throw new Error(
        'Required parameter sessionId was null or undefined when calling iterateOptimizationSessionApiV1OptimizationSessionsSessionIdIteratePost.',
      );
    }
    if (optimizationIterationRequest === null || optimizationIterationRequest === undefined) {
      throw new Error(
        'Required parameter optimizationIterationRequest was null or undefined when calling iterateOptimizationSessionApiV1OptimizationSessionsSessionIdIteratePost.',
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

    const localVarPath = `/api/v1/optimization/sessions/${this.configuration.encodeParam({ name: 'sessionId', value: sessionId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: undefined })}/iterate`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<OptimizationIterationResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: optimizationIterationRequest,
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
   * List Optimization Sessions
   * Lists all iterative Hospital Optimization sessions owned by the authenticated user.  Args:     db (AsyncSession): Active PostgreSQL async session.     current_user (User): Authenticated hospital user.  Returns:     list[OptimizationSessionResponse]: User\&#39;s optimization sessions.
   * @endpoint get /api/v1/optimization/sessions
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public listOptimizationSessionsApiV1OptimizationSessionsGet(
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<OptimizationSessionResponse[]>;
  public listOptimizationSessionsApiV1OptimizationSessionsGet(
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<OptimizationSessionResponse[]>>;
  public listOptimizationSessionsApiV1OptimizationSessionsGet(
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<OptimizationSessionResponse[]>>;
  public listOptimizationSessionsApiV1OptimizationSessionsGet(
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

    const localVarPath = `/api/v1/optimization/sessions`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<OptimizationSessionResponse[]>(
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
   * Solve Optimization Stateless
   * Solves Use Case 1, Use Case 2, or Use Case 3 statelessly in JAX/MPAX and evaluates against the JAX Discrete Event Simulation (DES) expert baseline.  Args:     request (OptimizationSolveRequest): Stateless optimization solve payload.     current_user (User): Authenticated hospital user.  Returns:     OptimizationSolutionPayload: Solved assignments/schedule and DES baseline metrics.
   * @endpoint post /api/v1/optimization/solve
   * @param optimizationSolveRequest Parameter `optimizationSolveRequest`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public solveOptimizationStatelessApiV1OptimizationSolvePost(
    optimizationSolveRequest: OptimizationSolveRequest,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<OptimizationSolutionPayload>;
  public solveOptimizationStatelessApiV1OptimizationSolvePost(
    optimizationSolveRequest: OptimizationSolveRequest,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<OptimizationSolutionPayload>>;
  public solveOptimizationStatelessApiV1OptimizationSolvePost(
    optimizationSolveRequest: OptimizationSolveRequest,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<OptimizationSolutionPayload>>;
  public solveOptimizationStatelessApiV1OptimizationSolvePost(
    optimizationSolveRequest: OptimizationSolveRequest,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (optimizationSolveRequest === null || optimizationSolveRequest === undefined) {
      throw new Error(
        'Required parameter optimizationSolveRequest was null or undefined when calling solveOptimizationStatelessApiV1OptimizationSolvePost.',
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

    const localVarPath = `/api/v1/optimization/solve`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<OptimizationSolutionPayload>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: optimizationSolveRequest,
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
   * Submit Optimization Survey
   * Submits a qualitative and quantitative UX evaluation survey comparing the self-service LLM-MPAX workflow against (A) the manual graduate-student email loop and (B) other hospital tech.  Args:     payload (OptimizationSurveyCreate): Survey submission payload.     db (AsyncSession): Active PostgreSQL async session.     current_user (User): Authenticated hospital user.  Returns:     OptimizationSurveyResponse: Persisted survey record.
   * @endpoint post /api/v1/optimization/surveys
   * @param optimizationSurveyCreate Parameter `optimizationSurveyCreate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public submitOptimizationSurveyApiV1OptimizationSurveysPost(
    optimizationSurveyCreate: OptimizationSurveyCreate,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<OptimizationSurveyResponse>;
  public submitOptimizationSurveyApiV1OptimizationSurveysPost(
    optimizationSurveyCreate: OptimizationSurveyCreate,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<OptimizationSurveyResponse>>;
  public submitOptimizationSurveyApiV1OptimizationSurveysPost(
    optimizationSurveyCreate: OptimizationSurveyCreate,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<OptimizationSurveyResponse>>;
  public submitOptimizationSurveyApiV1OptimizationSurveysPost(
    optimizationSurveyCreate: OptimizationSurveyCreate,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (optimizationSurveyCreate === null || optimizationSurveyCreate === undefined) {
      throw new Error(
        'Required parameter optimizationSurveyCreate was null or undefined when calling submitOptimizationSurveyApiV1OptimizationSurveysPost.',
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

    const localVarPath = `/api/v1/optimization/surveys`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<OptimizationSurveyResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: optimizationSurveyCreate,
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
