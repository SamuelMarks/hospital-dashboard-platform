/**
 * @fileoverview Generated OpenAPI Angular service for Hospital Analytics Platform.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse, HttpEvent, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { OpenApiHttpParams, QueryParamStyle } from '../query.params';

import { UserResponse } from '../model/user-response';
import { UserRoleUpdate } from '../model/user-role-update';
import { UserStatusUpdate } from '../model/user-status-update';

import { BASE_PATH } from '../variables';
import { Configuration } from '../configuration';
import { BaseService } from '../api.base.service';

/**
 * Injectable OpenAPI client service.
 */
@Injectable({
  providedIn: 'root',
})
export class AdminUsersService extends BaseService {
  /** Angular HttpClient used to dispatch REST requests. */
  protected readonly httpClient = inject(HttpClient);

  /** Initializes the service with optional base path and OpenAPI configuration. */
  constructor() {
    super(inject(BASE_PATH, { optional: true }), inject(Configuration, { optional: true }));
  }

  /**
   * List Users
   * Lists hospital platform users with optional role filtering and email search.  Args:     db (AsyncSession): PostgreSQL async database session.     current_user (User): Requesting administrator user.     limit (int): Pagination batch size limit (1 - 200). Defaults to 50.     offset (int): Pagination record offset. Defaults to 0.     role (str | None): Optional clinical role filter. Defaults to None.     search (str | None): Optional email search substring. Defaults to None.  Returns:     list[User]: Filtered list of registered user profiles.
   * @endpoint get /api/v1/admin/users/
   * @param limit Parameter `limit`.
   * @param offset Parameter `offset`.
   * @param role Parameter `role`.
   * @param search Parameter `search`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public listUsersApiV1AdminUsersGet(
    limit?: number,
    offset?: number,
    role?: string,
    search?: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<UserResponse[]>;
  public listUsersApiV1AdminUsersGet(
    limit?: number,
    offset?: number,
    role?: string,
    search?: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<UserResponse[]>>;
  public listUsersApiV1AdminUsersGet(
    limit?: number,
    offset?: number,
    role?: string,
    search?: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<UserResponse[]>>;
  public listUsersApiV1AdminUsersGet(
    limit?: number,
    offset?: number,
    role?: string,
    search?: string,
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
      'role',
      role,
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

    const localVarPath = `/api/v1/admin/users/`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<UserResponse[]>(
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
   * List Users
   * Lists hospital platform users with optional role filtering and email search.  Args:     db (AsyncSession): PostgreSQL async database session.     current_user (User): Requesting administrator user.     limit (int): Pagination batch size limit (1 - 200). Defaults to 50.     offset (int): Pagination record offset. Defaults to 0.     role (str | None): Optional clinical role filter. Defaults to None.     search (str | None): Optional email search substring. Defaults to None.  Returns:     list[User]: Filtered list of registered user profiles.
   * @endpoint get /api/v1/admin/users
   * @param limit Parameter `limit`.
   * @param offset Parameter `offset`.
   * @param role Parameter `role`.
   * @param search Parameter `search`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public listUsersApiV1AdminUsersGet_1(
    limit?: number,
    offset?: number,
    role?: string,
    search?: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<UserResponse[]>;
  public listUsersApiV1AdminUsersGet_1(
    limit?: number,
    offset?: number,
    role?: string,
    search?: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<UserResponse[]>>;
  public listUsersApiV1AdminUsersGet_1(
    limit?: number,
    offset?: number,
    role?: string,
    search?: string,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<UserResponse[]>>;
  public listUsersApiV1AdminUsersGet_1(
    limit?: number,
    offset?: number,
    role?: string,
    search?: string,
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
      'role',
      role,
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

    const localVarPath = `/api/v1/admin/users`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<UserResponse[]>(
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
   * Update User Role
   * Updates the clinical or administrative role assignment for a target user.  Args:     user_id (UUID): Target user identifier.     payload (UserRoleUpdate): Desired new clinical role string.     db (AsyncSession): PostgreSQL async database session.     current_user (User): Requesting administrator user.  Returns:     User: The updated user profile entity.  Raises:     HTTPException: 400 if the role is invalid, 404 if the user is not found.
   * @endpoint put /api/v1/admin/users/{user_id}/role
   * @param userId Parameter `userId`.
   * @param userRoleUpdate Parameter `userRoleUpdate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public updateUserRoleApiV1AdminUsersUserIdRolePut(
    userId: string,
    userRoleUpdate: UserRoleUpdate,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<UserResponse>;
  public updateUserRoleApiV1AdminUsersUserIdRolePut(
    userId: string,
    userRoleUpdate: UserRoleUpdate,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<UserResponse>>;
  public updateUserRoleApiV1AdminUsersUserIdRolePut(
    userId: string,
    userRoleUpdate: UserRoleUpdate,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<UserResponse>>;
  public updateUserRoleApiV1AdminUsersUserIdRolePut(
    userId: string,
    userRoleUpdate: UserRoleUpdate,
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
    if (userId === null || userId === undefined) {
      throw new Error(
        'Required parameter userId was null or undefined when calling updateUserRoleApiV1AdminUsersUserIdRolePut.',
      );
    }
    if (userRoleUpdate === null || userRoleUpdate === undefined) {
      throw new Error(
        'Required parameter userRoleUpdate was null or undefined when calling updateUserRoleApiV1AdminUsersUserIdRolePut.',
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

    const localVarPath = `/api/v1/admin/users/${this.configuration.encodeParam({ name: 'userId', value: userId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/role`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<UserResponse>(this.httpClient, 'put', `${basePath}${localVarPath}`, {
      context: localVarHttpContext,
      body: userRoleUpdate,
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
   * Update User Status
   * Activates or suspends a hospital user platform account.  Prevents administrators from suspending their own active account.  Args:     user_id (UUID): Target user identifier.     payload (UserStatusUpdate): New active flag state.     db (AsyncSession): PostgreSQL async database session.     current_user (User): Requesting administrator user.  Returns:     User: The updated user profile entity.  Raises:     HTTPException: 400 if administrator attempts self-suspension, 404 if not found.
   * @endpoint put /api/v1/admin/users/{user_id}/status
   * @param userId Parameter `userId`.
   * @param userStatusUpdate Parameter `userStatusUpdate`.
   * @param token JWT token query parameter for direct browser downloads
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public updateUserStatusApiV1AdminUsersUserIdStatusPut(
    userId: string,
    userStatusUpdate: UserStatusUpdate,
    token?: string,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<UserResponse>;
  public updateUserStatusApiV1AdminUsersUserIdStatusPut(
    userId: string,
    userStatusUpdate: UserStatusUpdate,
    token?: string,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<UserResponse>>;
  public updateUserStatusApiV1AdminUsersUserIdStatusPut(
    userId: string,
    userStatusUpdate: UserStatusUpdate,
    token?: string,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<UserResponse>>;
  public updateUserStatusApiV1AdminUsersUserIdStatusPut(
    userId: string,
    userStatusUpdate: UserStatusUpdate,
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
    if (userId === null || userId === undefined) {
      throw new Error(
        'Required parameter userId was null or undefined when calling updateUserStatusApiV1AdminUsersUserIdStatusPut.',
      );
    }
    if (userStatusUpdate === null || userStatusUpdate === undefined) {
      throw new Error(
        'Required parameter userStatusUpdate was null or undefined when calling updateUserStatusApiV1AdminUsersUserIdStatusPut.',
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

    const localVarPath = `/api/v1/admin/users/${this.configuration.encodeParam({ name: 'userId', value: userId, in: 'path', style: 'simple', explode: false, dataType: 'string', dataFormat: 'uuid' })}/status`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<UserResponse>(this.httpClient, 'put', `${basePath}${localVarPath}`, {
      context: localVarHttpContext,
      body: userStatusUpdate,
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
