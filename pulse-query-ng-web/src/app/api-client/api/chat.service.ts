/**
 * @fileoverview Generated OpenAPI Angular service for Hospital Analytics Platform.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse, HttpEvent, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { OpenApiHttpParams, QueryParamStyle } from '../query.params';

import { ConversationCreate } from '../model/conversation-create';
import { ConversationDetail } from '../model/conversation-detail';
import { ConversationResponse } from '../model/conversation-response';
import { ConversationUpdate } from '../model/conversation-update';
import { MessageCreate } from '../model/message-create';
import { MessageResponse } from '../model/message-response';
import { MessageVoteRequest } from '../model/message-vote-request';

import { BASE_PATH } from '../variables';
import { Configuration } from '../configuration';
import { BaseService } from '../api.base.service';

/**
 * Injectable OpenAPI client service.
 */
@Injectable({
  providedIn: 'root',
})
export class ChatService extends BaseService {
  /** Angular HttpClient used to dispatch REST requests. */
  protected readonly httpClient = inject(HttpClient);

  /** Initializes the service with optional base path and OpenAPI configuration. */
  constructor() {
    super(inject(BASE_PATH, { optional: true }), inject(Configuration, { optional: true }));
  }

  /**
   * Create Conversation
   * Create a new conversation and optionally seed the first message.
   * @endpoint post /api/v1/chat/
   * @param conversationCreate Parameter `conversationCreate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public createConversationApiV1ChatPost(
    conversationCreate: ConversationCreate,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<ConversationDetail>;
  public createConversationApiV1ChatPost(
    conversationCreate: ConversationCreate,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<ConversationDetail>>;
  public createConversationApiV1ChatPost(
    conversationCreate: ConversationCreate,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<ConversationDetail>>;
  public createConversationApiV1ChatPost(
    conversationCreate: ConversationCreate,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (conversationCreate === null || conversationCreate === undefined) {
      throw new Error(
        'Required parameter conversationCreate was null or undefined when calling createConversationApiV1ChatPost.',
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

    const localVarPath = `/api/v1/chat/`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<ConversationDetail>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: conversationCreate,
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
   * Create Conversation
   * Create a new conversation and optionally seed the first message.
   * @endpoint post /api/v1/conversations/
   * @param conversationCreate Parameter `conversationCreate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public createConversationApiV1ConversationsPost(
    conversationCreate: ConversationCreate,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<ConversationDetail>;
  public createConversationApiV1ConversationsPost(
    conversationCreate: ConversationCreate,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<ConversationDetail>>;
  public createConversationApiV1ConversationsPost(
    conversationCreate: ConversationCreate,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<ConversationDetail>>;
  public createConversationApiV1ConversationsPost(
    conversationCreate: ConversationCreate,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (conversationCreate === null || conversationCreate === undefined) {
      throw new Error(
        'Required parameter conversationCreate was null or undefined when calling createConversationApiV1ConversationsPost.',
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

    const localVarPath = `/api/v1/conversations/`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<ConversationDetail>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: conversationCreate,
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
   * Delete Conversation
   * Delete a conversation and its messages.
   * @endpoint delete /api/v1/chat/{conversation_id}
   * @param conversationId Parameter `conversationId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public deleteConversationApiV1ChatConversationIdDelete(
    conversationId: string,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown>;
  public deleteConversationApiV1ChatConversationIdDelete(
    conversationId: string,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<unknown>>;
  public deleteConversationApiV1ChatConversationIdDelete(
    conversationId: string,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<unknown>>;
  public deleteConversationApiV1ChatConversationIdDelete(
    conversationId: string,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (conversationId === null || conversationId === undefined) {
      throw new Error(
        'Required parameter conversationId was null or undefined when calling deleteConversationApiV1ChatConversationIdDelete.',
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

    const localVarPath = `/api/v1/chat/${this.configuration.encodeParam({ name: 'conversationId', value: conversationId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}`;
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
   * Delete Conversation
   * Delete a conversation and its messages.
   * @endpoint delete /api/v1/conversations/{conversation_id}
   * @param conversationId Parameter `conversationId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public deleteConversationApiV1ConversationsConversationIdDelete(
    conversationId: string,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown>;
  public deleteConversationApiV1ConversationsConversationIdDelete(
    conversationId: string,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<unknown>>;
  public deleteConversationApiV1ConversationsConversationIdDelete(
    conversationId: string,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<unknown>>;
  public deleteConversationApiV1ConversationsConversationIdDelete(
    conversationId: string,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (conversationId === null || conversationId === undefined) {
      throw new Error(
        'Required parameter conversationId was null or undefined when calling deleteConversationApiV1ConversationsConversationIdDelete.',
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

    const localVarPath = `/api/v1/conversations/${this.configuration.encodeParam({ name: 'conversationId', value: conversationId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}`;
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
   * Get Messages
   * Return the ordered message history for a conversation.
   * @endpoint get /api/v1/chat/{conversation_id}/messages
   * @param conversationId Parameter `conversationId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public getMessagesApiV1ChatConversationIdMessagesGet(
    conversationId: string,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<MessageResponse[]>;
  public getMessagesApiV1ChatConversationIdMessagesGet(
    conversationId: string,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<MessageResponse[]>>;
  public getMessagesApiV1ChatConversationIdMessagesGet(
    conversationId: string,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<MessageResponse[]>>;
  public getMessagesApiV1ChatConversationIdMessagesGet(
    conversationId: string,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (conversationId === null || conversationId === undefined) {
      throw new Error(
        'Required parameter conversationId was null or undefined when calling getMessagesApiV1ChatConversationIdMessagesGet.',
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

    const localVarPath = `/api/v1/chat/${this.configuration.encodeParam({ name: 'conversationId', value: conversationId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/messages`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<MessageResponse[]>(
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
   * Get Messages
   * Return the ordered message history for a conversation.
   * @endpoint get /api/v1/conversations/{conversation_id}/messages
   * @param conversationId Parameter `conversationId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public getMessagesApiV1ConversationsConversationIdMessagesGet(
    conversationId: string,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<MessageResponse[]>;
  public getMessagesApiV1ConversationsConversationIdMessagesGet(
    conversationId: string,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<MessageResponse[]>>;
  public getMessagesApiV1ConversationsConversationIdMessagesGet(
    conversationId: string,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<MessageResponse[]>>;
  public getMessagesApiV1ConversationsConversationIdMessagesGet(
    conversationId: string,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (conversationId === null || conversationId === undefined) {
      throw new Error(
        'Required parameter conversationId was null or undefined when calling getMessagesApiV1ConversationsConversationIdMessagesGet.',
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

    const localVarPath = `/api/v1/conversations/${this.configuration.encodeParam({ name: 'conversationId', value: conversationId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/messages`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<MessageResponse[]>(
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
   * List Conversations
   * List recent conversations for the current user.
   * @endpoint get /api/v1/chat/
   * @param limit Parameter `limit`.
   * @param offset Parameter `offset`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public listConversationsApiV1ChatGet(
    limit?: number,
    offset?: number,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<ConversationResponse[]>;
  public listConversationsApiV1ChatGet(
    limit?: number,
    offset?: number,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<ConversationResponse[]>>;
  public listConversationsApiV1ChatGet(
    limit?: number,
    offset?: number,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<ConversationResponse[]>>;
  public listConversationsApiV1ChatGet(
    limit?: number,
    offset?: number,
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
      'limit',
      limit,
      QueryParamStyle.Form,
      true,
    );

    localVarQueryParameters = this.addToHttpParams(
      localVarQueryParameters,
      'offset',
      offset,
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

    const localVarPath = `/api/v1/chat/`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<ConversationResponse[]>(
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
   * List Conversations
   * List recent conversations for the current user.
   * @endpoint get /api/v1/conversations/
   * @param limit Parameter `limit`.
   * @param offset Parameter `offset`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public listConversationsApiV1ConversationsGet(
    limit?: number,
    offset?: number,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<ConversationResponse[]>;
  public listConversationsApiV1ConversationsGet(
    limit?: number,
    offset?: number,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<ConversationResponse[]>>;
  public listConversationsApiV1ConversationsGet(
    limit?: number,
    offset?: number,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<ConversationResponse[]>>;
  public listConversationsApiV1ConversationsGet(
    limit?: number,
    offset?: number,
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
      'limit',
      limit,
      QueryParamStyle.Form,
      true,
    );

    localVarQueryParameters = this.addToHttpParams(
      localVarQueryParameters,
      'offset',
      offset,
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

    const localVarPath = `/api/v1/conversations/`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<ConversationResponse[]>(
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
   * Send Message
   * Append a user message and generate assistant candidates.
   * @endpoint post /api/v1/chat/{conversation_id}/messages
   * @param conversationId Parameter `conversationId`.
   * @param messageCreate Parameter `messageCreate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public sendMessageApiV1ChatConversationIdMessagesPost(
    conversationId: string,
    messageCreate: MessageCreate,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<MessageResponse>;
  public sendMessageApiV1ChatConversationIdMessagesPost(
    conversationId: string,
    messageCreate: MessageCreate,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<MessageResponse>>;
  public sendMessageApiV1ChatConversationIdMessagesPost(
    conversationId: string,
    messageCreate: MessageCreate,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<MessageResponse>>;
  public sendMessageApiV1ChatConversationIdMessagesPost(
    conversationId: string,
    messageCreate: MessageCreate,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (conversationId === null || conversationId === undefined) {
      throw new Error(
        'Required parameter conversationId was null or undefined when calling sendMessageApiV1ChatConversationIdMessagesPost.',
      );
    }
    if (messageCreate === null || messageCreate === undefined) {
      throw new Error(
        'Required parameter messageCreate was null or undefined when calling sendMessageApiV1ChatConversationIdMessagesPost.',
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

    const localVarPath = `/api/v1/chat/${this.configuration.encodeParam({ name: 'conversationId', value: conversationId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/messages`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<MessageResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: messageCreate,
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
   * Send Message
   * Append a user message and generate assistant candidates.
   * @endpoint post /api/v1/conversations/{conversation_id}/messages
   * @param conversationId Parameter `conversationId`.
   * @param messageCreate Parameter `messageCreate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public sendMessageApiV1ConversationsConversationIdMessagesPost(
    conversationId: string,
    messageCreate: MessageCreate,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<MessageResponse>;
  public sendMessageApiV1ConversationsConversationIdMessagesPost(
    conversationId: string,
    messageCreate: MessageCreate,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<MessageResponse>>;
  public sendMessageApiV1ConversationsConversationIdMessagesPost(
    conversationId: string,
    messageCreate: MessageCreate,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<MessageResponse>>;
  public sendMessageApiV1ConversationsConversationIdMessagesPost(
    conversationId: string,
    messageCreate: MessageCreate,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (conversationId === null || conversationId === undefined) {
      throw new Error(
        'Required parameter conversationId was null or undefined when calling sendMessageApiV1ConversationsConversationIdMessagesPost.',
      );
    }
    if (messageCreate === null || messageCreate === undefined) {
      throw new Error(
        'Required parameter messageCreate was null or undefined when calling sendMessageApiV1ConversationsConversationIdMessagesPost.',
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

    const localVarPath = `/api/v1/conversations/${this.configuration.encodeParam({ name: 'conversationId', value: conversationId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/messages`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<MessageResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: messageCreate,
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
   * Stream Conversation Tokens
   * Server-Sent Events (SSE) endpoint streaming real-time LLM token generation.  Args:     conversation_id (UUID): The conversation ID context.     db (AsyncSession): Database session.     current_user (User): Authenticated user owning the conversation.     model_id (Optional[str]): Targeted model ID.  Returns:     StreamingResponse: Text/event-stream containing incremental tokens.
   * @endpoint get /api/v1/chat/stream/{conversation_id}
   * @param conversationId Parameter `conversationId`.
   * @param modelId Parameter `modelId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public streamConversationTokensApiV1ChatStreamConversationIdGet(
    conversationId: string,
    modelId?: string,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown>;
  public streamConversationTokensApiV1ChatStreamConversationIdGet(
    conversationId: string,
    modelId?: string,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<unknown>>;
  public streamConversationTokensApiV1ChatStreamConversationIdGet(
    conversationId: string,
    modelId?: string,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<unknown>>;
  public streamConversationTokensApiV1ChatStreamConversationIdGet(
    conversationId: string,
    modelId?: string,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (conversationId === null || conversationId === undefined) {
      throw new Error(
        'Required parameter conversationId was null or undefined when calling streamConversationTokensApiV1ChatStreamConversationIdGet.',
      );
    }

    let localVarQueryParameters = new OpenApiHttpParams(this.encoder);

    localVarQueryParameters = this.addToHttpParams(
      localVarQueryParameters,
      'model_id',
      modelId,
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

    const localVarPath = `/api/v1/chat/stream/${this.configuration.encodeParam({ name: 'conversationId', value: conversationId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}`;
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
   * Stream Conversation Tokens
   * Server-Sent Events (SSE) endpoint streaming real-time LLM token generation.  Args:     conversation_id (UUID): The conversation ID context.     db (AsyncSession): Database session.     current_user (User): Authenticated user owning the conversation.     model_id (Optional[str]): Targeted model ID.  Returns:     StreamingResponse: Text/event-stream containing incremental tokens.
   * @endpoint get /api/v1/conversations/stream/{conversation_id}
   * @param conversationId Parameter `conversationId`.
   * @param modelId Parameter `modelId`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public streamConversationTokensApiV1ConversationsStreamConversationIdGet(
    conversationId: string,
    modelId?: string,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown>;
  public streamConversationTokensApiV1ConversationsStreamConversationIdGet(
    conversationId: string,
    modelId?: string,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<unknown>>;
  public streamConversationTokensApiV1ConversationsStreamConversationIdGet(
    conversationId: string,
    modelId?: string,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<unknown>>;
  public streamConversationTokensApiV1ConversationsStreamConversationIdGet(
    conversationId: string,
    modelId?: string,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (conversationId === null || conversationId === undefined) {
      throw new Error(
        'Required parameter conversationId was null or undefined when calling streamConversationTokensApiV1ConversationsStreamConversationIdGet.',
      );
    }

    let localVarQueryParameters = new OpenApiHttpParams(this.encoder);

    localVarQueryParameters = this.addToHttpParams(
      localVarQueryParameters,
      'model_id',
      modelId,
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

    const localVarPath = `/api/v1/conversations/stream/${this.configuration.encodeParam({ name: 'conversationId', value: conversationId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}`;
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
   * Update Conversation
   * Update the title for an existing conversation.
   * @endpoint put /api/v1/chat/{conversation_id}
   * @param conversationId Parameter `conversationId`.
   * @param conversationUpdate Parameter `conversationUpdate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public updateConversationApiV1ChatConversationIdPut(
    conversationId: string,
    conversationUpdate: ConversationUpdate,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<ConversationResponse>;
  public updateConversationApiV1ChatConversationIdPut(
    conversationId: string,
    conversationUpdate: ConversationUpdate,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<ConversationResponse>>;
  public updateConversationApiV1ChatConversationIdPut(
    conversationId: string,
    conversationUpdate: ConversationUpdate,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<ConversationResponse>>;
  public updateConversationApiV1ChatConversationIdPut(
    conversationId: string,
    conversationUpdate: ConversationUpdate,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (conversationId === null || conversationId === undefined) {
      throw new Error(
        'Required parameter conversationId was null or undefined when calling updateConversationApiV1ChatConversationIdPut.',
      );
    }
    if (conversationUpdate === null || conversationUpdate === undefined) {
      throw new Error(
        'Required parameter conversationUpdate was null or undefined when calling updateConversationApiV1ChatConversationIdPut.',
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

    const localVarPath = `/api/v1/chat/${this.configuration.encodeParam({ name: 'conversationId', value: conversationId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<ConversationResponse>(
      this.httpClient,
      'put',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: conversationUpdate,
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
   * Update Conversation
   * Update the title for an existing conversation.
   * @endpoint put /api/v1/conversations/{conversation_id}
   * @param conversationId Parameter `conversationId`.
   * @param conversationUpdate Parameter `conversationUpdate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public updateConversationApiV1ConversationsConversationIdPut(
    conversationId: string,
    conversationUpdate: ConversationUpdate,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<ConversationResponse>;
  public updateConversationApiV1ConversationsConversationIdPut(
    conversationId: string,
    conversationUpdate: ConversationUpdate,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<ConversationResponse>>;
  public updateConversationApiV1ConversationsConversationIdPut(
    conversationId: string,
    conversationUpdate: ConversationUpdate,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<ConversationResponse>>;
  public updateConversationApiV1ConversationsConversationIdPut(
    conversationId: string,
    conversationUpdate: ConversationUpdate,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (conversationId === null || conversationId === undefined) {
      throw new Error(
        'Required parameter conversationId was null or undefined when calling updateConversationApiV1ConversationsConversationIdPut.',
      );
    }
    if (conversationUpdate === null || conversationUpdate === undefined) {
      throw new Error(
        'Required parameter conversationUpdate was null or undefined when calling updateConversationApiV1ConversationsConversationIdPut.',
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

    const localVarPath = `/api/v1/conversations/${this.configuration.encodeParam({ name: 'conversationId', value: conversationId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<ConversationResponse>(
      this.httpClient,
      'put',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: conversationUpdate,
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
   * Vote Candidate
   * Records a user\&#39;s vote for a specific generated candidate.  This selects the chosen candidate by its ID (or matching SQL hash), sets its &#x60;is_selected&#x60; flag to True, and promotes its text and SQL contents to the parent Message object.
   * @endpoint post /api/v1/chat/{conversation_id}/messages/{message_id}/vote
   * @param conversationId Parameter `conversationId`.
   * @param messageId Parameter `messageId`.
   * @param messageVoteRequest Parameter `messageVoteRequest`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public voteCandidateApiV1ChatConversationIdMessagesMessageIdVotePost(
    conversationId: string,
    messageId: string,
    messageVoteRequest: MessageVoteRequest,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<MessageResponse>;
  public voteCandidateApiV1ChatConversationIdMessagesMessageIdVotePost(
    conversationId: string,
    messageId: string,
    messageVoteRequest: MessageVoteRequest,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<MessageResponse>>;
  public voteCandidateApiV1ChatConversationIdMessagesMessageIdVotePost(
    conversationId: string,
    messageId: string,
    messageVoteRequest: MessageVoteRequest,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<MessageResponse>>;
  public voteCandidateApiV1ChatConversationIdMessagesMessageIdVotePost(
    conversationId: string,
    messageId: string,
    messageVoteRequest: MessageVoteRequest,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (conversationId === null || conversationId === undefined) {
      throw new Error(
        'Required parameter conversationId was null or undefined when calling voteCandidateApiV1ChatConversationIdMessagesMessageIdVotePost.',
      );
    }
    if (messageId === null || messageId === undefined) {
      throw new Error(
        'Required parameter messageId was null or undefined when calling voteCandidateApiV1ChatConversationIdMessagesMessageIdVotePost.',
      );
    }
    if (messageVoteRequest === null || messageVoteRequest === undefined) {
      throw new Error(
        'Required parameter messageVoteRequest was null or undefined when calling voteCandidateApiV1ChatConversationIdMessagesMessageIdVotePost.',
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

    const localVarPath = `/api/v1/chat/${this.configuration.encodeParam({ name: 'conversationId', value: conversationId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/messages/${this.configuration.encodeParam({ name: 'messageId', value: messageId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/vote`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<MessageResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: messageVoteRequest,
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
   * Vote Candidate
   * Records a user\&#39;s vote for a specific generated candidate.  This selects the chosen candidate by its ID (or matching SQL hash), sets its &#x60;is_selected&#x60; flag to True, and promotes its text and SQL contents to the parent Message object.
   * @endpoint post /api/v1/conversations/{conversation_id}/messages/{message_id}/vote
   * @param conversationId Parameter `conversationId`.
   * @param messageId Parameter `messageId`.
   * @param messageVoteRequest Parameter `messageVoteRequest`.
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost(
    conversationId: string,
    messageId: string,
    messageVoteRequest: MessageVoteRequest,
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<MessageResponse>;
  public voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost(
    conversationId: string,
    messageId: string,
    messageVoteRequest: MessageVoteRequest,
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<MessageResponse>>;
  public voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost(
    conversationId: string,
    messageId: string,
    messageVoteRequest: MessageVoteRequest,
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<MessageResponse>>;
  public voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost(
    conversationId: string,
    messageId: string,
    messageVoteRequest: MessageVoteRequest,
    token?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (conversationId === null || conversationId === undefined) {
      throw new Error(
        'Required parameter conversationId was null or undefined when calling voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost.',
      );
    }
    if (messageId === null || messageId === undefined) {
      throw new Error(
        'Required parameter messageId was null or undefined when calling voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost.',
      );
    }
    if (messageVoteRequest === null || messageVoteRequest === undefined) {
      throw new Error(
        'Required parameter messageVoteRequest was null or undefined when calling voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost.',
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

    const localVarPath = `/api/v1/conversations/${this.configuration.encodeParam({ name: 'conversationId', value: conversationId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/messages/${this.configuration.encodeParam({ name: 'messageId', value: messageId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/vote`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<MessageResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: messageVoteRequest,
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
