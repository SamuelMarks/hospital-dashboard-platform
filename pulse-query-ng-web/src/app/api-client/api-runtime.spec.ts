/**
 * @fileoverview Unit tests for OpenAPI client runtime classes and helpers:
 * `BaseService`, `ApiModule`, `Configuration`, `CustomHttpParameterCodec`,
 * `IdentityHttpParameterCodec`, `provideApi`, and `OpenApiHttpParams`.
 */

import { describe, it, expect, vi } from 'vitest';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpContext,
  HttpHeaders,
  HttpParams,
  provideHttpClient,
} from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { BaseService, ApiRequestOptions } from './api.base.service';
import { ApiModule } from './api.module';
import { Configuration } from './configuration';
import { CustomHttpParameterCodec, IdentityHttpParameterCodec } from './encoder';
import { provideApi } from './provide-api';
import { OpenApiHttpParams, QueryParamStyle, concatHttpParamsObject } from './query.params';
import { BASE_PATH, COLLECTION_FORMATS } from './variables';
import { Param } from './param';

/**
 * Concrete subclass of `BaseService` exposing protected helper methods for unit testing.
 */
class TestableBaseService extends BaseService {
  /**
   * Initializes the testable base service.
   *
   * @param basePath - Optional base URL or array of base URLs.
   * @param configuration - Optional OpenAPI `Configuration`.
   */
  constructor(basePath?: string | string[] | null, configuration?: Configuration | null) {
    super(basePath, configuration);
  }

  /**
   * Exposes `canConsumeForm` for testing.
   *
   * @param consumes - Accepted MIME types.
   * @returns True when `multipart/form-data` is present.
   */
  public testCanConsumeForm(consumes: string[]): boolean {
    return this.canConsumeForm(consumes);
  }

  /**
   * Exposes `appendFormParam` for testing.
   *
   * @param formParams - Target `HttpParams` or `FormData`.
   * @param key - Parameter name.
   * @param value - Parameter primitive value.
   * @returns Updated container.
   */
  public testAppendFormParam(
    formParams: HttpParams | FormData,
    key: string,
    value: string | number | boolean,
  ): HttpParams | FormData {
    return this.appendFormParam(formParams, key, value);
  }

  /**
   * Exposes `executeRequest` for testing.
   *
   * @param httpClient - Angular `HttpClient`.
   * @param method - HTTP method.
   * @param url - Request URL.
   * @param options - Request options.
   * @returns Observable response.
   */
  public testExecuteRequest<T>(
    httpClient: HttpClient,
    method: string,
    url: string,
    options: ApiRequestOptions,
  ): Observable<unknown> {
    return this.executeRequest<T>(httpClient, method, url, options);
  }

  /**
   * Exposes `addToHttpParams` for testing.
   *
   * @param httpParams - Target `OpenApiHttpParams`.
   * @param key - Parameter key.
   * @param value - Parameter value.
   * @param paramStyle - Parameter style.
   * @param explode - Whether to explode composite values.
   * @returns Updated `OpenApiHttpParams`.
   */
  public testAddToHttpParams(
    httpParams: OpenApiHttpParams,
    key: string,
    value: unknown,
    paramStyle: QueryParamStyle,
    explode: boolean,
  ): OpenApiHttpParams {
    return this.addToHttpParams(httpParams, key, value, paramStyle, explode);
  }
}

describe('OpenAPI Client Runtime', () => {
  describe('CustomHttpParameterCodec & IdentityHttpParameterCodec', () => {
    it('encodes and decodes keys and values with CustomHttpParameterCodec', () => {
      const codec = new CustomHttpParameterCodec();
      expect(codec.encodeKey('a b+c')).toBe('a%20b%2Bc');
      expect(codec.encodeValue('x/y?z=1')).toBe('x%2Fy%3Fz%3D1');
      expect(codec.decodeKey('a%20b%2Bc')).toBe('a b+c');
      expect(codec.decodeValue('x%2Fy%3Fz%3D1')).toBe('x/y?z=1');
    });

    it('passes keys and values through unchanged with IdentityHttpParameterCodec', () => {
      const codec = new IdentityHttpParameterCodec();
      expect(codec.encodeKey('raw%20key')).toBe('raw%20key');
      expect(codec.encodeValue('raw%20val')).toBe('raw%20val');
      expect(codec.decodeKey('raw%20key')).toBe('raw%20key');
      expect(codec.decodeValue('raw%20val')).toBe('raw%20val');
      expect(COLLECTION_FORMATS.csv).toBe(',');
    });
  });

  describe('provideApi & ApiModule', () => {
    it('provides BASE_PATH when given a string and Configuration when given parameters', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideApi('https://hospital.example.com')],
      });
      expect(TestBed.inject(BASE_PATH)).toBe('https://hospital.example.com');

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideApi({ basePath: 'https://config.example.com', withCredentials: true })],
      });
      const cfg = TestBed.inject(Configuration);
      expect(cfg.basePath).toBe('https://config.example.com');
      expect(cfg.withCredentials).toBe(true);
    });

    it('registers ApiModule.forRoot and validates constructor guards', () => {
      const customConfig = new Configuration({ basePath: 'https://module.example.com' });
      const modWithProviders = ApiModule.forRoot(() => customConfig);
      expect(modWithProviders.ngModule).toBe(ApiModule);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [modWithProviders],
        providers: [provideHttpClient()],
      });
      expect(TestBed.inject(Configuration)).toBe(customConfig);
      expect(TestBed.inject(ApiModule)).toBeInstanceOf(ApiModule);

      // Missing HttpClient guard
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [ApiModule, { provide: HttpClient, useValue: null }],
      });
      expect(() => TestBed.inject(ApiModule)).toThrow(/You need to import the HttpClientModule/);

      // Already loaded parent ApiModule guard
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), { provide: ApiModule, useValue: {} as ApiModule }],
      });
      const parentEnvInjector = TestBed.inject(EnvironmentInjector);
      const childInjector = createEnvironmentInjector([ApiModule], parentEnvInjector);
      expect(() => childInjector.get(ApiModule)).toThrow(/ApiModule is already loaded/);
      childInjector.destroy();
    });
  });

  describe('Configuration', () => {
    it('initializes with default and explicit ConfigurationParameters', () => {
      const defaultCfg = new Configuration();
      expect(defaultCfg.credentials['OAuth2PasswordBearer']).toBeTypeOf('function');
      expect(defaultCfg.lookupCredential('OAuth2PasswordBearer')).toBeUndefined();
      expect(defaultCfg.lookupCredential('missing')).toBeUndefined();

      const customEncoder = new IdentityHttpParameterCodec();
      const customEncodeParam = (p: Param): string => `custom:${String(p.value)}`;
      const fullCfg = new Configuration({
        apiKeys: { api_key: 'k123' },
        username: 'admin',
        password: 'secret',
        accessToken: 'static-token',
        basePath: 'https://api.stanford.edu',
        withCredentials: true,
        encoder: customEncoder,
        encodeParam: customEncodeParam,
      });
      expect(fullCfg.apiKeys).toEqual({ api_key: 'k123' });
      expect(fullCfg.username).toBe('admin');
      expect(fullCfg.password).toBe('secret');
      expect(fullCfg.basePath).toBe('https://api.stanford.edu');
      expect(fullCfg.withCredentials).toBe(true);
      expect(fullCfg.encoder).toBe(customEncoder);
      expect(fullCfg.lookupCredential('OAuth2PasswordBearer')).toBe('static-token');
      expect(
        fullCfg.encodeParam({
          name: 'id',
          value: 42,
          in: 'path',
          style: 'simple',
          explode: false,
          dataType: 'number',
          dataFormat: undefined,
        }),
      ).toBe('custom:42');

      const fnTokenCfg = new Configuration({
        accessToken: () => 'dynamic-token',
      });
      expect(fnTokenCfg.lookupCredential('OAuth2PasswordBearer')).toBe('dynamic-token');

      const explicitCredsCfg = new Configuration({
        credentials: {
          OAuth2PasswordBearer: 'preset-bearer',
          CustomKey: () => 'custom-val',
        },
      });
      expect(explicitCredsCfg.lookupCredential('OAuth2PasswordBearer')).toBe('preset-bearer');
      expect(explicitCredsCfg.lookupCredential('CustomKey')).toBe('custom-val');
    });

    it('negotiates Content-Type and Accept headers and checks JSON MIME types', () => {
      const cfg = new Configuration();
      expect(cfg.selectHeaderContentType([])).toBeUndefined();
      expect(cfg.selectHeaderContentType(['text/plain', 'application/xml'])).toBe('text/plain');
      expect(cfg.selectHeaderContentType(['text/plain', 'application/json'])).toBe(
        'application/json',
      );

      expect(cfg.selectHeaderAccept([])).toBeUndefined();
      expect(cfg.selectHeaderAccept(['text/csv', 'application/pdf'])).toBe('text/csv');
      expect(cfg.selectHeaderAccept(['text/csv', 'application/ld+json; charset=utf-8'])).toBe(
        'application/ld+json; charset=utf-8',
      );

      expect(cfg.isJsonMime('application/json')).toBe(true);
      expect(cfg.isJsonMime('application/json-patch+json')).toBe(true);
      expect(cfg.isJsonMime('application/problem+json')).toBe(true);
      expect(cfg.isJsonMime('text/html')).toBe(false);
    });

    it('adds credentials to headers and query params and encodes path params', () => {
      const cfg = new Configuration({
        credentials: {
          OAuth2PasswordBearer: 'my-jwt',
          ApiKeyQuery: 'q-secret',
        },
      });

      const baseHeaders = new HttpHeaders();
      const withBearer = cfg.addCredentialToHeaders(
        'OAuth2PasswordBearer',
        'Authorization',
        baseHeaders,
        'Bearer ',
      );
      expect(withBearer.get('Authorization')).toBe('Bearer my-jwt');

      const withoutPrefix = cfg.addCredentialToHeaders(
        'OAuth2PasswordBearer',
        'X-Token',
        baseHeaders,
      );
      expect(withoutPrefix.get('X-Token')).toBe('my-jwt');

      const missingHeader = cfg.addCredentialToHeaders('Unknown', 'Authorization', baseHeaders);
      expect(missingHeader.has('Authorization')).toBe(false);

      const baseQuery = new HttpParams();
      const withQuery = cfg.addCredentialToQuery('ApiKeyQuery', 'api_key', baseQuery);
      expect(withQuery.get('api_key')).toBe('q-secret');

      const missingQuery = cfg.addCredentialToQuery('Unknown', 'api_key', baseQuery);
      expect(missingQuery.has('api_key')).toBe(false);

      const dateVal = new Date('2026-05-01T12:30:00.000Z');
      expect(
        cfg.encodeParam({
          name: 'ts',
          value: dateVal,
          in: 'path',
          style: 'simple',
          explode: false,
          dataType: 'Date',
          dataFormat: 'date-time',
        }),
      ).toBe(encodeURIComponent(dateVal.toISOString()));

      expect(
        cfg.encodeParam({
          name: 'ts',
          value: '2026-05-01',
          in: 'path',
          style: 'simple',
          explode: false,
          dataType: 'string',
          dataFormat: 'date-time',
        }),
      ).toBe('2026-05-01');
    });
  });

  describe('OpenApiHttpParams & concatHttpParamsObject', () => {
    it('supports set, append, toString, toRecord, toHttpParams, and concatHttpParamsObject', () => {
      const params = new OpenApiHttpParams();
      params.append('tag', 'alpha');
      params.append('tag', 'beta');
      params.append('tag', 'gamma', { explode: false, delimiter: '|' });
      expect(params.toRecord()['tag']).toBe('alpha|beta|gamma');
      expect(params.toString()).toContain('tag=alpha|beta|gamma');

      const exploded = new OpenApiHttpParams(new IdentityHttpParameterCodec(), {
        explode: true,
        delimiter: ',',
      });
      exploded.set('single', 'one');
      exploded.append('single', 'two');
      expect(exploded.toRecord()['single']).toEqual(['one', 'two']);
      const ngParams = exploded.toHttpParams();
      expect(ngParams.getAll('single')).toEqual(['one', 'two']);

      const dateItem = new Date('2026-03-15T00:00:00.000Z');
      concatHttpParamsObject(
        exploded,
        'filter',
        {
          unit: 'PICU',
          tags: ['peds', dateItem],
          created: dateItem,
        },
        ',',
      );
      expect(exploded.toRecord()['filter']).toContain('unit,PICU');
    });
  });

  describe('BaseService', () => {
    it('resolves basePath and encoder across all constructor combinations', () => {
      const sDefault = new TestableBaseService();
      expect(sDefault.configuration.basePath).toBe('http://localhost');

      const sArray = new TestableBaseService(['https://primary.hospital.org', 'https://backup']);
      expect(sArray.configuration.basePath).toBe('https://primary.hospital.org');

      const sEmptyArray = new TestableBaseService([]);
      expect(sEmptyArray.configuration.basePath).toBe('http://localhost');

      const customEncoder = new IdentityHttpParameterCodec();
      const sPreconfigured = new TestableBaseService(
        'https://ignored.org',
        new Configuration({ basePath: 'https://configured.org', encoder: customEncoder }),
      );
      expect(sPreconfigured.configuration.basePath).toBe('https://configured.org');
      expect(sPreconfigured.encoder).toBe(customEncoder);
    });

    it('checks canConsumeForm and appends form parameters to HttpParams and FormData', () => {
      const service = new TestableBaseService();
      expect(service.testCanConsumeForm(['application/json'])).toBe(false);
      expect(service.testCanConsumeForm(['application/json', 'multipart/form-data'])).toBe(true);

      const httpParams = service.testAppendFormParam(new HttpParams(), 'count', 5) as HttpParams;
      expect(httpParams.get('count')).toBe('5');

      const formData = new FormData();
      const updatedForm = service.testAppendFormParam(formData, 'active', true) as FormData;
      expect(updatedForm.get('active')).toBe('true');
    });

    it('dispatches executeRequest across all observe and responseType combinations', () => {
      const service = new TestableBaseService();
      const requestSpy = vi.fn().mockReturnValue(of('ok'));
      const mockHttp = { request: requestSpy } as unknown as HttpClient;

      const observes: ('body' | 'response' | 'events')[] = ['body', 'response', 'events'];
      const responseTypes: ('json' | 'text' | 'blob')[] = ['json', 'text', 'blob'];

      for (const observe of observes) {
        for (const responseType of responseTypes) {
          service.testExecuteRequest(mockHttp, 'post', 'http://localhost/test', {
            body: { a: 1 },
            headers: new HttpHeaders({ 'X-Test': '1' }),
            context: new HttpContext(),
            params: new HttpParams().set('q', '1'),
            reportProgress: true,
            withCredentials: true,
            transferCache: false,
            observe,
            responseType,
          });
        }
      }

      // Also test default observe/responseType and omitted optional properties
      service.testExecuteRequest(mockHttp, 'get', 'http://localhost/minimal', {});
      expect(requestSpy).toHaveBeenCalledTimes(10);
    });

    it('serializes query parameters across all QueryParamStyle and value types', () => {
      const service = new TestableBaseService();
      let hp = new OpenApiHttpParams(service.encoder);

      // null and undefined are no-ops
      hp = service.testAddToHttpParams(hp, 'emptyNull', null, QueryParamStyle.Form, true);
      hp = service.testAddToHttpParams(hp, 'emptyUndef', undefined, QueryParamStyle.Form, true);
      expect(hp.toString()).toBe('');

      // DeepObject error and valid object
      expect(() =>
        service.testAddToHttpParams(
          hp,
          'deepBad',
          'not-an-object',
          QueryParamStyle.DeepObject,
          true,
        ),
      ).toThrow(/An object must be provided for key deepBad/);
      hp = service.testAddToHttpParams(
        hp,
        'deep',
        { unit: 'NICU', beds: 10 },
        QueryParamStyle.DeepObject,
        true,
      );
      expect(hp.toRecord()['deep%5Bunit%5D']).toEqual(['NICU']);

      // Json style
      hp = service.testAddToHttpParams(hp, 'jsonParam', { a: 1 }, QueryParamStyle.Json, false);
      expect(hp.toRecord()['jsonParam']).toEqual([encodeURIComponent('{"a":1}')]);

      // Primitive and Date
      hp = service.testAddToHttpParams(hp, 'prim', 42, QueryParamStyle.Form, true);
      const dt = new Date('2026-01-01T00:00:00.000Z');
      hp = service.testAddToHttpParams(hp, 'dt', dt, QueryParamStyle.Form, true);
      expect(hp.toRecord()['prim']).toEqual(['42']);
      expect(hp.toRecord()['dt']).toEqual([encodeURIComponent(dt.toISOString())]);

      // Arrays: Form, SpaceDelimited, PipeDelimited
      hp = service.testAddToHttpParams(hp, 'arrForm', ['a', 'b'], QueryParamStyle.Form, false);
      hp = service.testAddToHttpParams(
        hp,
        'arrSpace',
        ['a', 'b'],
        QueryParamStyle.SpaceDelimited,
        false,
      );
      hp = service.testAddToHttpParams(
        hp,
        'arrPipe',
        ['a', 'b'],
        QueryParamStyle.PipeDelimited,
        false,
      );
      expect(hp.toRecord()['arrForm']).toBe('a,b');
      expect(hp.toRecord()['arrSpace']).toBe('a b');
      expect(hp.toRecord()['arrPipe']).toBe('a|b');

      // Objects: Form (explode=true and explode=false), SpaceDelimited, PipeDelimited
      hp = service.testAddToHttpParams(
        hp,
        'objFormExplode',
        { k1: 'v1', k2: 'v2' },
        QueryParamStyle.Form,
        true,
      );
      expect(hp.toRecord()['k1']).toEqual(['v1']);
      expect(hp.toRecord()['k2']).toEqual(['v2']);

      hp = service.testAddToHttpParams(
        hp,
        'objFormFlat',
        { k1: 'v1' },
        QueryParamStyle.Form,
        false,
      );
      expect(hp.toRecord()['objFormFlat']).toBe('k1,v1');

      hp = service.testAddToHttpParams(
        hp,
        'objSpace',
        { k1: 'v1' },
        QueryParamStyle.SpaceDelimited,
        false,
      );
      expect(hp.toRecord()['objSpace']).toBe('k1 v1');

      hp = service.testAddToHttpParams(
        hp,
        'objPipe',
        { k1: 'v1' },
        QueryParamStyle.PipeDelimited,
        false,
      );
      expect(hp.toRecord()['objPipe']).toBe('k1|v1');
    });
  });
});
