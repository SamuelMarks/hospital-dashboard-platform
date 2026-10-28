/**
 * @fileoverview Generated OpenAPI Angular service for Hospital Analytics Platform.
 */

import { Service, inject } from '@angular/core';
import { HttpClient, HttpResponse, HttpEvent, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';

import { MpaxArenaRequest } from '../model/mpax-arena-request';
import { MpaxArenaResponse } from '../model/mpax-arena-response';

import { BASE_PATH } from '../variables';
import { Configuration } from '../configuration';
import { BaseService } from '../api.base.service';
import { OpenApiHttpParams, QueryParamStyle } from '../query.params';

/**
 * Injectable OpenAPI client service.
 */
@Service()
export class MpaxArenaService extends BaseService {
  /** Angular HttpClient used to dispatch REST requests. */
  protected readonly httpClient = inject(HttpClient);

  /** Initializes the service with optional base path and OpenAPI configuration. */
  constructor() {
    super(inject(BASE_PATH, { optional: true }), inject(Configuration, { optional: true }));
  }

  /**
   * Run Mpax Arena Mode
   * Executes an MPAX Arena evaluation mode. Modes: judge, translator, constraints, sql_vs_mpax, critic.
   * @endpoint post /api/v1/mpax_arena/run
   * @param mpaxArenaRequest Parameter `mpaxArenaRequest`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public runMpaxArenaModeApiV1MpaxArenaRunPost(
    mpaxArenaRequest: MpaxArenaRequest,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<MpaxArenaResponse>;
  public runMpaxArenaModeApiV1MpaxArenaRunPost(
    mpaxArenaRequest: MpaxArenaRequest,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<MpaxArenaResponse>>;
  public runMpaxArenaModeApiV1MpaxArenaRunPost(
    mpaxArenaRequest: MpaxArenaRequest,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<MpaxArenaResponse>>;
  public runMpaxArenaModeApiV1MpaxArenaRunPost(
    mpaxArenaRequest: MpaxArenaRequest,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (mpaxArenaRequest === null || mpaxArenaRequest === undefined) {
      throw new Error(
        'Required parameter mpaxArenaRequest was null or undefined when calling runMpaxArenaModeApiV1MpaxArenaRunPost.',
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

    const localVarPath = `/api/v1/mpax_arena/run`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<MpaxArenaResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: mpaxArenaRequest,
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
   * Vote Mpax Arena Candidate
   * Records a winning vote for an LLM candidate in an MPAX Arena run.  Args:     run_id (str): UUID string identifying the MPAX Arena experiment.     candidate_id (str): UUID string identifying the candidate voted for.     current_user (User): Authenticated user session.     db (AsyncSession): Active transactional database session.  Returns:     MpaxArenaResponse: Updated experiment results with is_selected true for winning candidate.  Raises:     HTTPException: 404 if run or candidate not found, 500 on server failure.
   * @endpoint post /api/v1/mpax_arena/runs/{run_id}/candidates/{candidate_id}/vote
   * @param runId Parameter `runId`.
   * @param candidateId Parameter `candidateId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost(
    runId: string,
    candidateId: string,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<MpaxArenaResponse>;
  public voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost(
    runId: string,
    candidateId: string,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<MpaxArenaResponse>>;
  public voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost(
    runId: string,
    candidateId: string,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<MpaxArenaResponse>>;
  public voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost(
    runId: string,
    candidateId: string,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (runId === null || runId === undefined) {
      throw new Error(
        'Required parameter runId was null or undefined when calling voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost.',
      );
    }
    if (candidateId === null || candidateId === undefined) {
      throw new Error(
        'Required parameter candidateId was null or undefined when calling voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost.',
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

    const localVarPath = `/api/v1/mpax_arena/runs/${this.configuration.encodeParam({ name: 'runId', value: runId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: undefined })}/candidates/${this.configuration.encodeParam({ name: 'candidateId', value: candidateId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: undefined })}/vote`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<MpaxArenaResponse>(
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
}
