/**
 * @fileoverview Generated OpenAPI Angular service for Hospital Analytics Platform.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse, HttpEvent, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { OpenApiHttpParams, QueryParamStyle } from '../query.params';

import { ForgotPasswordRequest } from '../model/forgot-password-request';
import { PasswordResetResponse } from '../model/password-reset-response';
import { RefreshTokenRequest } from '../model/refresh-token-request';
import { ResetPasswordRequest } from '../model/reset-password-request';
import { Token } from '../model/token';
import { UserCreate } from '../model/user-create';
import { UserResponse } from '../model/user-response';

import { BASE_PATH } from '../variables';
import { Configuration } from '../configuration';
import { BaseService } from '../api.base.service';

/**
 * Injectable OpenAPI client service.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService extends BaseService {
  /** Angular HttpClient used to dispatch REST requests. */
  protected readonly httpClient = inject(HttpClient);

  /** Initializes the service with optional base path and OpenAPI configuration. */
  constructor() {
    super(inject(BASE_PATH, { optional: true }), inject(Configuration, { optional: true }));
  }

  /**
   * Forgot Password
   * Generates a secure password reset token and dispatches reset instructions.  Args:     payload (ForgotPasswordRequest): Email address of requesting user.     db (AsyncSession): PostgreSQL async database session.     email_service (EmailNotificationService): Transactional email service dependency.  Returns:     PasswordResetResponse: Confirmation message (reset token omitted from response).
   * @endpoint post /api/v1/auth/forgot-password
   * @param forgotPasswordRequest Parameter `forgotPasswordRequest`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public forgotPasswordApiV1AuthForgotPasswordPost(
    forgotPasswordRequest: ForgotPasswordRequest,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<PasswordResetResponse>;
  public forgotPasswordApiV1AuthForgotPasswordPost(
    forgotPasswordRequest: ForgotPasswordRequest,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<PasswordResetResponse>>;
  public forgotPasswordApiV1AuthForgotPasswordPost(
    forgotPasswordRequest: ForgotPasswordRequest,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<PasswordResetResponse>>;
  public forgotPasswordApiV1AuthForgotPasswordPost(
    forgotPasswordRequest: ForgotPasswordRequest,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (forgotPasswordRequest === null || forgotPasswordRequest === undefined) {
      throw new Error(
        'Required parameter forgotPasswordRequest was null or undefined when calling forgotPasswordApiV1AuthForgotPasswordPost.',
      );
    }

    let localVarHeaders = this.defaultHeaders;

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

    const localVarPath = `/api/v1/auth/forgot-password`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<PasswordResetResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: forgotPasswordRequest,
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
   * Login Access Token
   * OAuth2 compatible token login, get an access token for future requests.  Args:     form_data (OAuth2PasswordRequestForm): Login credentials (username&#x3D;email).     db (AsyncSession): Database session.  Returns:     Token: Access token and type.
   * @endpoint post /api/v1/auth/login
   * @param username Parameter `username`.
   * @param password Parameter `password`.
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param grantType Parameter `grantType`.
   * @param scope Parameter `scope`.
   * @param clientId Parameter `clientId`.
   * @param clientSecret Parameter `clientSecret`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public loginAccessTokenApiV1AuthLoginPost(
    username: string,
    password: string,
    acceptLanguage?: string,
    grantType?: string,
    scope?: string,
    clientId?: string,
    clientSecret?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<Token>;
  public loginAccessTokenApiV1AuthLoginPost(
    username: string,
    password: string,
    acceptLanguage?: string,
    grantType?: string,
    scope?: string,
    clientId?: string,
    clientSecret?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<Token>>;
  public loginAccessTokenApiV1AuthLoginPost(
    username: string,
    password: string,
    acceptLanguage?: string,
    grantType?: string,
    scope?: string,
    clientId?: string,
    clientSecret?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<Token>>;
  public loginAccessTokenApiV1AuthLoginPost(
    username: string,
    password: string,
    acceptLanguage?: string,
    grantType?: string,
    scope?: string,
    clientId?: string,
    clientSecret?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (username === null || username === undefined) {
      throw new Error(
        'Required parameter username was null or undefined when calling loginAccessTokenApiV1AuthLoginPost.',
      );
    }
    if (password === null || password === undefined) {
      throw new Error(
        'Required parameter password was null or undefined when calling loginAccessTokenApiV1AuthLoginPost.',
      );
    }

    let localVarHeaders = this.defaultHeaders;
    if (acceptLanguage !== undefined && acceptLanguage !== null) {
      localVarHeaders = localVarHeaders.set('Accept-Language', String(acceptLanguage));
    }

    const localVarHttpHeaderAcceptSelected: string | undefined =
      options?.httpHeaderAccept ?? this.configuration.selectHeaderAccept(['application/json']);
    if (localVarHttpHeaderAcceptSelected !== undefined) {
      localVarHeaders = localVarHeaders.set('Accept', localVarHttpHeaderAcceptSelected);
    }

    const localVarHttpContext: HttpContext = options?.context ?? new HttpContext();

    const localVarTransferCache: boolean = options?.transferCache ?? true;

    // to determine the Content-Type header
    const consumes: string[] = ['application/x-www-form-urlencoded'];

    void this.canConsumeForm(consumes);

    let localVarFormParams: HttpParams | FormData;
    const localVarUseForm = false;
    const localVarConvertFormParamsToString = false;
    if (localVarUseForm) {
      localVarFormParams = new FormData();
    } else {
      localVarFormParams = new HttpParams({ encoder: this.encoder });
    }

    if (grantType !== undefined) {
      localVarFormParams = this.appendFormParam(localVarFormParams, 'grant_type', grantType);
    }
    if (username !== undefined) {
      localVarFormParams = this.appendFormParam(localVarFormParams, 'username', username);
    }
    if (password !== undefined) {
      localVarFormParams = this.appendFormParam(localVarFormParams, 'password', password);
    }
    if (scope !== undefined) {
      localVarFormParams = this.appendFormParam(localVarFormParams, 'scope', scope);
    }
    if (clientId !== undefined) {
      localVarFormParams = this.appendFormParam(localVarFormParams, 'client_id', clientId);
    }
    if (clientSecret !== undefined) {
      localVarFormParams = this.appendFormParam(localVarFormParams, 'client_secret', clientSecret);
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

    const localVarPath = `/api/v1/auth/login`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<Token>(this.httpClient, 'post', `${basePath}${localVarPath}`, {
      context: localVarHttpContext,
      body: localVarConvertFormParamsToString ? localVarFormParams.toString() : localVarFormParams,
      responseType: responseType_,
      ...(withCredentials ? { withCredentials } : {}),
      headers: localVarHeaders,
      observe: observe,
      ...(localVarTransferCache !== undefined ? { transferCache: localVarTransferCache } : {}),
      reportProgress: reportProgress,
    });
  }

  /**
   * Read Users Me
   * Fetch the current logged in user profile.
   * @endpoint get /api/v1/auth/me
   * @param token JWT token query parameter for direct browser downloads
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public readUsersMeApiV1AuthMeGet(
    token?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<UserResponse>;
  public readUsersMeApiV1AuthMeGet(
    token?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<UserResponse>>;
  public readUsersMeApiV1AuthMeGet(
    token?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<UserResponse>>;
  public readUsersMeApiV1AuthMeGet(
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

    const localVarPath = `/api/v1/auth/me`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<UserResponse>(this.httpClient, 'get', `${basePath}${localVarPath}`, {
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
   * Refresh Access Token
   * Rotates refresh token and issues a new access and refresh token pair.  Args:     payload (RefreshTokenRequest): Active refresh token.     db (AsyncSession): PostgreSQL async database session.  Returns:     Token: New rotated access and refresh tokens.  Raises:     HTTPException: 401 if refresh token is invalid, expired, or revoked.
   * @endpoint post /api/v1/auth/refresh
   * @param refreshTokenRequest Parameter `refreshTokenRequest`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public refreshAccessTokenApiV1AuthRefreshPost(
    refreshTokenRequest: RefreshTokenRequest,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<Token>;
  public refreshAccessTokenApiV1AuthRefreshPost(
    refreshTokenRequest: RefreshTokenRequest,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<Token>>;
  public refreshAccessTokenApiV1AuthRefreshPost(
    refreshTokenRequest: RefreshTokenRequest,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<Token>>;
  public refreshAccessTokenApiV1AuthRefreshPost(
    refreshTokenRequest: RefreshTokenRequest,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (refreshTokenRequest === null || refreshTokenRequest === undefined) {
      throw new Error(
        'Required parameter refreshTokenRequest was null or undefined when calling refreshAccessTokenApiV1AuthRefreshPost.',
      );
    }

    let localVarHeaders = this.defaultHeaders;

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

    const localVarPath = `/api/v1/auth/refresh`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<Token>(this.httpClient, 'post', `${basePath}${localVarPath}`, {
      context: localVarHttpContext,
      body: refreshTokenRequest,
      responseType: responseType_,
      ...(withCredentials ? { withCredentials } : {}),
      headers: localVarHeaders,
      observe: observe,
      ...(localVarTransferCache !== undefined ? { transferCache: localVarTransferCache } : {}),
      reportProgress: reportProgress,
    });
  }

  /**
   * Register User
   * Register a new user in the system.  Steps: 1. Verify email uniqueness. 2. Create User record. 3. Flush session (to generate User ID). 4. Call Provisioning Service to create default dashboard/widgets. 5. Commit transaction.  Args:     user_in (UserCreate): The payload containing email and password.     db (AsyncSession): Database session.  Returns:     User: The newly created user object.  Raises:     HTTPException: If email already exists.
   * @endpoint post /api/v1/auth/register
   * @param userCreate Parameter `userCreate`.
   * @param acceptLanguage Parameter `acceptLanguage`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public registerUserApiV1AuthRegisterPost(
    userCreate: UserCreate,
    acceptLanguage?: string,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<UserResponse>;
  public registerUserApiV1AuthRegisterPost(
    userCreate: UserCreate,
    acceptLanguage?: string,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<UserResponse>>;
  public registerUserApiV1AuthRegisterPost(
    userCreate: UserCreate,
    acceptLanguage?: string,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<UserResponse>>;
  public registerUserApiV1AuthRegisterPost(
    userCreate: UserCreate,
    acceptLanguage?: string,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (userCreate === null || userCreate === undefined) {
      throw new Error(
        'Required parameter userCreate was null or undefined when calling registerUserApiV1AuthRegisterPost.',
      );
    }

    let localVarHeaders = this.defaultHeaders;
    if (acceptLanguage !== undefined && acceptLanguage !== null) {
      localVarHeaders = localVarHeaders.set('Accept-Language', String(acceptLanguage));
    }

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

    const localVarPath = `/api/v1/auth/register`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<UserResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: userCreate,
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
   * Reset Password
   * Resets user account password and revokes existing sessions.  Args:     payload (ResetPasswordRequest): Reset token and new password.     db (AsyncSession): PostgreSQL async database session.  Returns:     PasswordResetResponse: Success confirmation message.  Raises:     HTTPException: 400 if reset token is invalid or expired.     HTTPException: 404 if the user cannot be located.
   * @endpoint post /api/v1/auth/reset-password
   * @param resetPasswordRequest Parameter `resetPasswordRequest`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public resetPasswordApiV1AuthResetPasswordPost(
    resetPasswordRequest: ResetPasswordRequest,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<PasswordResetResponse>;
  public resetPasswordApiV1AuthResetPasswordPost(
    resetPasswordRequest: ResetPasswordRequest,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<PasswordResetResponse>>;
  public resetPasswordApiV1AuthResetPasswordPost(
    resetPasswordRequest: ResetPasswordRequest,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<PasswordResetResponse>>;
  public resetPasswordApiV1AuthResetPasswordPost(
    resetPasswordRequest: ResetPasswordRequest,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (resetPasswordRequest === null || resetPasswordRequest === undefined) {
      throw new Error(
        'Required parameter resetPasswordRequest was null or undefined when calling resetPasswordApiV1AuthResetPasswordPost.',
      );
    }

    let localVarHeaders = this.defaultHeaders;

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

    const localVarPath = `/api/v1/auth/reset-password`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<PasswordResetResponse>(
      this.httpClient,
      'post',
      `${basePath}${localVarPath}`,
      {
        context: localVarHttpContext,
        body: resetPasswordRequest,
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
   * Revoke Session
   * Revokes an active refresh token session.  Args:     payload (RefreshTokenRequest): Refresh token to revoke.     db (AsyncSession): PostgreSQL async database session.
   * @endpoint post /api/v1/auth/revoke
   * @param refreshTokenRequest Parameter `refreshTokenRequest`.
   * @param observe set whether or not to return the data Observable as the body, response or events. defaults to returning the body.
   * @param reportProgress flag to report request and response progress.
   * @param options additional options
   * @returns Observable emitting the API response.
   */
  public revokeSessionApiV1AuthRevokePost(
    refreshTokenRequest: RefreshTokenRequest,
    observe?: 'body',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown>;
  public revokeSessionApiV1AuthRevokePost(
    refreshTokenRequest: RefreshTokenRequest,
    observe?: 'response',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpResponse<unknown>>;
  public revokeSessionApiV1AuthRevokePost(
    refreshTokenRequest: RefreshTokenRequest,
    observe?: 'events',
    reportProgress?: boolean,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<HttpEvent<unknown>>;
  public revokeSessionApiV1AuthRevokePost(
    refreshTokenRequest: RefreshTokenRequest,
    observe: 'body' | 'events' | 'response' = 'body',
    reportProgress = false,
    options?: {
      httpHeaderAccept?: 'application/json';
      context?: HttpContext;
      transferCache?: boolean;
    },
  ): Observable<unknown> {
    if (refreshTokenRequest === null || refreshTokenRequest === undefined) {
      throw new Error(
        'Required parameter refreshTokenRequest was null or undefined when calling revokeSessionApiV1AuthRevokePost.',
      );
    }

    let localVarHeaders = this.defaultHeaders;

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

    const localVarPath = `/api/v1/auth/revoke`;
    const { basePath, withCredentials } = this.configuration;
    return this.executeRequest<unknown>(this.httpClient, 'post', `${basePath}${localVarPath}`, {
      context: localVarHttpContext,
      body: refreshTokenRequest,
      responseType: responseType_,
      ...(withCredentials ? { withCredentials } : {}),
      headers: localVarHeaders,
      observe: observe,
      ...(localVarTransferCache !== undefined ? { transferCache: localVarTransferCache } : {}),
      reportProgress: reportProgress,
    });
  }
}
