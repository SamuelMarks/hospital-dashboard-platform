/**
 * @fileoverview Comprehensive unit tests for all 15 generated OpenAPI Angular services
 * in `src/app/api-client/api/`.
 */

import { describe, it, expect, vi } from 'vitest';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext } from '@angular/common/http';
import { of } from 'rxjs';
import { Configuration } from '../configuration';
import { BaseService } from '../api.base.service';
import { APIS } from './api';

/**
 * Extracts the count of parameters preceding `observe` and the count of required parameters
 * from a generated OpenAPI service method implementation.
 *
 * @param fn - Service method function to inspect.
 * @returns Tuple of `[paramsBeforeObserve, requiredParamCount]`.
 */
function inspectEndpointMethod(fn: (...args: unknown[]) => unknown): [number, number] {
  const src = fn.toString();
  const headerMatch = src.match(/^[^(]*\(([^)]*)\)/);
  const rawParams = headerMatch?.[1]
    ? headerMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];
  const observeIdx = rawParams.findIndex((p) => p.startsWith('observe'));
  const paramsBeforeObserve = observeIdx >= 0 ? observeIdx : rawParams.length;
  const requiredMatches = src.match(/Required parameter \w+ was null or undefined/g);
  const requiredParamCount = requiredMatches ? requiredMatches.length : 0;
  return [paramsBeforeObserve, requiredParamCount];
}

describe('OpenAPI Generated Services (APIS)', () => {
  it.each(APIS as Type<BaseService>[])(
    'exercises all endpoint methods and branches on %o',
    (ServiceClass: Type<BaseService>) => {
      const requestSpy = vi.fn().mockReturnValue(of({ ok: true }));
      const cfg = new Configuration({ basePath: 'http://localhost', withCredentials: false });

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          ServiceClass,
          { provide: HttpClient, useValue: { request: requestSpy } },
          { provide: Configuration, useValue: cfg },
        ],
      });

      const service = TestBed.inject(ServiceClass);
      const proto = Object.getPrototypeOf(service) as Record<string, unknown>;
      const methodNames = Object.getOwnPropertyNames(proto).filter(
        (name) => name !== 'constructor' && typeof proto[name] === 'function',
      );

      expect(methodNames.length).toBeGreaterThan(0);

      for (const methodName of methodNames) {
        const fn = (proto[methodName] as (...args: unknown[]) => unknown).bind(service);
        const [paramsBeforeObserve, requiredParamCount] = inspectEndpointMethod(
          proto[methodName] as (...args: unknown[]) => unknown,
        );

        // 1. Exercise null and undefined guards for each required parameter
        for (let reqIdx = 0; reqIdx < requiredParamCount; reqIdx++) {
          const nullArgs: unknown[] = Array.from({ length: reqIdx }, (_, i) => `req-${i}`);
          nullArgs.push(null);
          expect(() => fn(...nullArgs)).toThrow(/Required parameter/);

          const undefArgs: unknown[] = Array.from({ length: reqIdx }, (_, i) => `req-${i}`);
          undefArgs.push(undefined);
          expect(() => fn(...undefArgs)).toThrow(/Required parameter/);
        }

        // 2. Call with only required args (defaults for optional args, observe, reportProgress, options)
        cfg.withCredentials = false;
        const minArgs: unknown[] = Array.from({ length: requiredParamCount }, (_, i) => `req-${i}`);
        fn(...minArgs);

        // 3. Call with null for optional params, observe='response', reportProgress=true, text Accept, withCredentials=true
        cfg.withCredentials = true;
        const nullOptArgs: unknown[] = Array.from({ length: paramsBeforeObserve }, (_, i) =>
          i < requiredParamCount ? `req-${i}` : null,
        );
        nullOptArgs.push('response', true, {
          httpHeaderAccept: 'text/plain',
          context: new HttpContext(),
          transferCache: false,
        });
        fn(...nullOptArgs);

        // 4. Call with non-null values for all optional params, observe='events', blob Accept
        const fullArgs: unknown[] = Array.from({ length: paramsBeforeObserve }, (_, i) =>
          i < requiredParamCount ? `req-${i}` : `opt-${i}`,
        );
        fullArgs.push('events', false, {
          httpHeaderAccept: 'application/octet-stream',
          naturalText: 'count patients',
          processor: 'SQL',
          requestBody: { filter: 'PICU' },
        });
        fn(...fullArgs);

        // 5. Call when selectHeaderAccept and selectHeaderContentType return undefined
        const acceptSpy = vi.spyOn(cfg, 'selectHeaderAccept').mockReturnValueOnce(undefined);
        const contentSpy = vi.spyOn(cfg, 'selectHeaderContentType').mockReturnValueOnce(undefined);
        fn(...minArgs);
        acceptSpy.mockRestore();
        contentSpy.mockRestore();
      }
    },
  );
});
