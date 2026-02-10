/**
 * @fileoverview Unit tests for AuthService.
 * Verifies session logic, storage interactions, and API chaining.
 */

import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { AuthService as AuthApiClient, Token, UserResponse } from '../../api-client';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PLATFORM_ID } from '@angular/core';

describe('AuthService', () => {
  let service: AuthService;
  let mockApiClient: {
    loginAccessTokenApiV1AuthLoginPost: ReturnType<typeof vi.fn>;
    registerUserApiV1AuthRegisterPost: ReturnType<typeof vi.fn>;
    readUsersMeApiV1AuthMeGet: ReturnType<typeof vi.fn>;
  };
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };

  const mockToken: Token = { access_token: 'abc-123', token_type: 'bearer' };
  const mockUser: UserResponse = { id: 'u1', email: 'test@test.com', is_active: true };

  beforeEach(() => {
    mockApiClient = {
      loginAccessTokenApiV1AuthLoginPost: vi.fn(),
      registerUserApiV1AuthRegisterPost: vi.fn(),
      readUsersMeApiV1AuthMeGet: vi.fn()
    };
    mockRouter = {
      navigate: vi.fn()
    };

    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: AuthApiClient, useValue: mockApiClient },
        { provide: Router, useValue: mockRouter },
        { provide: PLATFORM_ID, useValue: 'browser' }
      ]
    });

    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('login', () => {
    it('should store token and fetch user on success', () => {
      mockApiClient.loginAccessTokenApiV1AuthLoginPost.mockReturnValue(of(mockToken));
      mockApiClient.readUsersMeApiV1AuthMeGet.mockReturnValue(of(mockUser));

      service.login({ email: 'u', password: 'p' }).subscribe();

      expect(localStorage.getItem('pulse_auth_token')).toBe('abc-123');
      expect(service.currentUser()).toEqual(mockUser);
      expect(service.isAuthenticated()).toBe(true);
    });

    it('should propagate error on failure', () => new Promise<void>(done => {
      mockApiClient.loginAccessTokenApiV1AuthLoginPost.mockReturnValue(throwError(() => new Error('401')));

      service.login({ email: 'u', password: 'p' }).subscribe({
        error: (err) => {
          expect(err).toBeTruthy();
          done();
        }
      });
    }));
  });

  it('should return token from storage in browser', () => {
    localStorage.setItem('pulse_auth_token', 'stored');
    expect(service.getToken()).toBe('stored');
    expect(service.hasStoredToken()).toBe(true);
  });

  it('should treat stored token as authenticated when user is not loaded', () => {
    localStorage.setItem('pulse_auth_token', 'stored');
    expect(service.isAuthenticated()).toBe(true);
  });

  it('should return false when no token is stored', () => {
    localStorage.removeItem('pulse_auth_token');
    expect(service.hasStoredToken()).toBe(false);
  });

  describe('logout', () => {
    it('should clear storage and redirect', () => {
      localStorage.setItem('pulse_auth_token', 'garbage');
      
      service.logout();

      expect(localStorage.getItem('pulse_auth_token')).toBeNull();
      expect(service.currentUser()).toBeNull();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('should allow logout without redirect', () => {
      localStorage.setItem('pulse_auth_token', 'garbage');

      service.logout(false);

      expect(localStorage.getItem('pulse_auth_token')).toBeNull();
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
      
      expect(mockApiClient.registerUserApiV1AuthRegisterPost).toHaveBeenCalledWith({ email: 'u', password: 'p' });
      expect(mockApiClient.loginAccessTokenApiV1AuthLoginPost).toHaveBeenCalledWith('u', 'p');
      expect(service.isAuthenticated()).toBe(true);
    });
  });
  
  describe('initialize', () => {
    it('should restore session if local token exists', async () => {
      localStorage.setItem('pulse_auth_token', 'valid');
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
        { provide: PLATFORM_ID, useValue: 'server' }
      ]
    });

    const serverService = TestBed.inject(AuthService);
    localStorage.setItem('pulse_auth_token', 'valid');

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
        { provide: PLATFORM_ID, useValue: 'server' }
      ]
    });

    const serverService = TestBed.inject(AuthService);
    const storageSpy = vi.spyOn(localStorage, 'setItem');
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
        { provide: PLATFORM_ID, useValue: 'server' }
      ]
    });

    const serverService = TestBed.inject(AuthService);
    const removeSpy = vi.spyOn(localStorage, 'removeItem');

    serverService.logout(false);

    expect(removeSpy).not.toHaveBeenCalled();
    removeSpy.mockRestore();
  });

  it('should logout when profile fetch fails', () => {
    mockApiClient.loginAccessTokenApiV1AuthLoginPost.mockReturnValue(of(mockToken));
    mockApiClient.readUsersMeApiV1AuthMeGet.mockReturnValue(throwError(() => new Error('bad token')));

    service.login({ email: 'u', password: 'p' }).subscribe({
      error: () => {}
    });

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
  });
});
