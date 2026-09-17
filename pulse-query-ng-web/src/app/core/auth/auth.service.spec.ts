import { safeStorage } from '../storage.utils';
/**
 * @fileoverview Unit tests for AuthService.
 * Verifies session logic, storage interactions, and API chaining.
 */

import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { AuthService as AuthApiClient, Token, UserResponse } from '../../api-client';
import { Router } from '@angular/router';
import { of, throwError, Subject } from 'rxjs';
import { PLATFORM_ID } from '@angular/core';

describe('AuthService', () => {
  let service: AuthService;
  let mockApiClient: {
    loginAccessTokenApiV1AuthLoginPost: ReturnType<typeof vi.fn>;
    registerUserApiV1AuthRegisterPost: ReturnType<typeof vi.fn>;
    readUsersMeApiV1AuthMeGet: ReturnType<typeof vi.fn>;
    refreshAccessTokenApiV1AuthRefreshPost: ReturnType<typeof vi.fn>;
  };
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };

  const mockToken: Token = {
    access_token: 'abc-123',
    token_type: 'bearer',
    refresh_token: 'ref-456',
  };
  const mockUser: UserResponse = {
    id: 'u1',
    email: 'test@test.com',
    is_active: true,
    is_admin: false,
    language_preference: 'en',
  };

  beforeEach(() => {
    mockApiClient = {
      loginAccessTokenApiV1AuthLoginPost: vi.fn(),
      registerUserApiV1AuthRegisterPost: vi.fn(),
      readUsersMeApiV1AuthMeGet: vi.fn(),
      refreshAccessTokenApiV1AuthRefreshPost: vi.fn(),
    };
    mockRouter = {
      navigate: vi.fn(),
    };

    safeStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: AuthApiClient, useValue: mockApiClient },
        { provide: Router, useValue: mockRouter },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    safeStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('login', () => {
    it('should store token and fetch user on success', () => {
      mockApiClient.loginAccessTokenApiV1AuthLoginPost.mockReturnValue(of(mockToken));
      mockApiClient.readUsersMeApiV1AuthMeGet.mockReturnValue(of(mockUser));

      service.login({ email: 'u', password: 'p' }).subscribe();

      expect(safeStorage.getItem('pulse_auth_token')).toBe('abc-123');
      expect(service.currentUser()).toEqual(mockUser);
      expect(service.isAuthenticated()).toBe(true);
    });

    it('should propagate error on failure', () =>
      new Promise<void>((done) => {
        mockApiClient.loginAccessTokenApiV1AuthLoginPost.mockReturnValue(
          throwError(() => new Error('401')),
        );

        service.login({ email: 'u', password: 'p' }).subscribe({
          error: (err) => {
            expect(err).toBeTruthy();
            done();
          },
        });
      }));
  });

  it('should return token from storage in browser', () => {
    safeStorage.setItem('pulse_auth_token', 'stored');
    expect(service.getToken()).toBe('stored');
    expect(service.hasStoredToken()).toBe(true);
  });

  it('should treat stored token as authenticated when user is not loaded', () => {
    safeStorage.setItem('pulse_auth_token', 'stored');
    expect(service.isAuthenticated()).toBe(true);
  });

  it('should return false when no token is stored', () => {
    safeStorage.removeItem('pulse_auth_token');
    expect(service.hasStoredToken()).toBe(false);
  });

  describe('refreshToken', () => {
    it('should throw error when no refresh token is stored', () =>
      new Promise<void>((done) => {
        service.refreshToken().subscribe({
          error: (err) => {
            expect(err.message).toBe('No refresh token available');
            done();
          },
        });
      }));

    it('should call API, update tokens and fetch profile on success', () => {
      safeStorage.setItem('pulse_refresh_token', 'initial-ref');
      const rotatedToken: Token = {
        access_token: 'new-acc',
        token_type: 'bearer',
        refresh_token: 'new-ref',
      };
      mockApiClient.refreshAccessTokenApiV1AuthRefreshPost.mockReturnValue(of(rotatedToken));
      mockApiClient.readUsersMeApiV1AuthMeGet.mockReturnValue(of(mockUser));

      service.refreshToken().subscribe((res) => {
        expect(res).toEqual(rotatedToken);
      });

      expect(safeStorage.getItem('pulse_auth_token')).toBe('new-acc');
      expect(safeStorage.getItem('pulse_refresh_token')).toBe('new-ref');
    });

    it('should serialize concurrent refreshToken calls into a single API request', () => {
      safeStorage.setItem('pulse_refresh_token', 'initial-ref');
      const refreshSubject = new Subject<Token>();
      mockApiClient.refreshAccessTokenApiV1AuthRefreshPost.mockReturnValue(refreshSubject);
      mockApiClient.readUsersMeApiV1AuthMeGet.mockReturnValue(of(mockUser));

      let res1: Token | undefined;
      let res2: Token | undefined;
      service.refreshToken().subscribe((t) => (res1 = t));
      service.refreshToken().subscribe((t) => (res2 = t));

      refreshSubject.next(mockToken);
      refreshSubject.complete();

      expect(mockApiClient.refreshAccessTokenApiV1AuthRefreshPost).toHaveBeenCalledTimes(1);
      expect(res1).toEqual(mockToken);
      expect(res2).toEqual(mockToken);
    });

    it('should logout on refresh failure', () =>
      new Promise<void>((done) => {
        safeStorage.setItem('pulse_refresh_token', 'initial-ref');
        mockApiClient.refreshAccessTokenApiV1AuthRefreshPost.mockReturnValue(
          throwError(() => new Error('Invalid token')),
        );

        service.refreshToken().subscribe({
          error: () => {
            expect(safeStorage.getItem('pulse_auth_token')).toBeNull();
            expect(safeStorage.getItem('pulse_refresh_token')).toBeNull();
            expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
            done();
          },
        });
      }));
  });

  describe('logout', () => {
    it('should clear storage and redirect', () => {
      safeStorage.setItem('pulse_auth_token', 'garbage');

      service.logout();

      expect(safeStorage.getItem('pulse_auth_token')).toBeNull();
      expect(service.currentUser()).toBeNull();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should allow logout without redirect', () => {
      safeStorage.setItem('pulse_auth_token', 'garbage');

      service.logout(false);

      expect(safeStorage.getItem('pulse_auth_token')).toBeNull();
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('should register and then switchMap to login', () => {
      mockApiClient.registerUserApiV1AuthRegisterPost.mockReturnValue(of(mockUser));
      mockApiClient.loginAccessTokenApiV1AuthLoginPost.mockReturnValue(of(mockToken));
      mockApiClient.readUsersMeApiV1AuthMeGet.mockReturnValue(of(mockUser));

      service.register({ email: 'u', password: 'p' }).subscribe((res) => {
        expect(res).toEqual(mockToken);
      });

      expect(mockApiClient.registerUserApiV1AuthRegisterPost).toHaveBeenCalledWith({
        email: 'u',
        password: 'p',
      });
      expect(mockApiClient.loginAccessTokenApiV1AuthLoginPost).toHaveBeenCalledWith('u', 'p');
      expect(service.isAuthenticated()).toBe(true);
    });
  });

  describe('initialize', () => {
    it('should restore session if local token exists', async () => {
      safeStorage.setItem('pulse_auth_token', 'valid');
      mockApiClient.readUsersMeApiV1AuthMeGet.mockReturnValue(of(mockUser));

      await service.initialize();

      expect(mockApiClient.readUsersMeApiV1AuthMeGet).toHaveBeenCalled();
      expect(service.currentUser()).toEqual(mockUser);
    });

    it('should skip profile fetch when no token is stored', async () => {
      await service.initialize();
      expect(mockApiClient.readUsersMeApiV1AuthMeGet).not.toHaveBeenCalled();
    });
  });

  it('should not access storage on the server platform', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: AuthApiClient, useValue: mockApiClient },
        { provide: Router, useValue: mockRouter },
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });

    const serverService = TestBed.inject(AuthService);
    safeStorage.setItem('pulse_auth_token', 'valid');

    await serverService.initialize();
    expect(serverService.getToken()).toBeNull();
    expect(serverService.hasStoredToken()).toBe(false);
    expect(mockApiClient.readUsersMeApiV1AuthMeGet).not.toHaveBeenCalled();
  });

  it('should not write to storage on server login', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: AuthApiClient, useValue: mockApiClient },
        { provide: Router, useValue: mockRouter },
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });

    const serverService = TestBed.inject(AuthService);
    const storageSpy = vi.spyOn(safeStorage, 'setItem');
    mockApiClient.loginAccessTokenApiV1AuthLoginPost.mockReturnValue(of(mockToken));
    mockApiClient.readUsersMeApiV1AuthMeGet.mockReturnValue(of(mockUser));

    serverService.login({ email: 'u', password: 'p' }).subscribe();

    expect(storageSpy).not.toHaveBeenCalled();
    expect(mockApiClient.readUsersMeApiV1AuthMeGet).toHaveBeenCalled();
    storageSpy.mockRestore();
  });

  it('should not clear storage on server logout', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: AuthApiClient, useValue: mockApiClient },
        { provide: Router, useValue: mockRouter },
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });

    const serverService = TestBed.inject(AuthService);
    const removeSpy = vi.spyOn(safeStorage, 'removeItem');

    serverService.logout(false);

    expect(removeSpy).not.toHaveBeenCalled();
    removeSpy.mockRestore();
  });

  it('should logout when profile fetch fails', () => {
    mockApiClient.loginAccessTokenApiV1AuthLoginPost.mockReturnValue(of(mockToken));
    mockApiClient.readUsersMeApiV1AuthMeGet.mockReturnValue(
      throwError(() => new Error('bad token')),
    );

    service.login({ email: 'u', password: 'p' }).subscribe({
      error: () => {},
    });

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
  });
});
