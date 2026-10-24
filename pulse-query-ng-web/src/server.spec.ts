/* @vitest-environment node */
/**
 * @fileoverview Unit tests for the Express SSR server (`src/server.ts`).
 */

import { vi } from 'vitest';

type MiddlewareFn = (req: unknown, res: unknown, next: (err?: unknown) => void) => unknown;

interface MockExpressApp {
  use: ReturnType<typeof vi.fn>;
  listen: ReturnType<typeof vi.fn>;
}

let handleMock = vi.fn();
let middlewares: MiddlewareFn[] = [];
let lastApp: MockExpressApp;

const writeResponseToNodeResponse = vi.fn();
const createNodeRequestHandler = vi.fn(() => 'handler');
const isMainModule = vi.fn(() => false);

const expressMock = Object.assign(
  vi.fn(() => {
    middlewares = [];
    lastApp = {
      use: vi.fn((arg1: unknown, arg2?: unknown) => {
        const fn = typeof arg1 === 'function' ? arg1 : arg2;
        if (typeof fn === 'function') {
          middlewares.push(fn as MiddlewareFn);
        }
      }),
      listen: vi.fn((_port: number, cb?: (err?: Error) => void) => {
        if (cb) cb();
        return { close: vi.fn() };
      }),
    };
    return lastApp;
  }),
  {
    static: vi.fn(() => (_req: unknown, _res: unknown, next?: () => void) => next?.()),
  },
);

vi.mock('express', () => ({
  default: expressMock,
}));

vi.mock('@angular/ssr/node', () => ({
  AngularNodeAppEngine: class {
    handle = (...args: unknown[]): unknown => handleMock(...args);
  },
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
}));

describe('server bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    handleMock = vi.fn();
    writeResponseToNodeResponse.mockReset();
    createNodeRequestHandler.mockClear();
    isMainModule.mockReturnValue(false);
    delete process.env['pm_id'];
  });

  it('creates request handler and renders responses', async () => {
    handleMock.mockResolvedValue({} as Response);

    const mod = await import('./server');
    expect(mod.reqHandler).toBe('handler');
    expect(createNodeRequestHandler).toHaveBeenCalledWith(lastApp);

    const next = vi.fn();
    const middleware = middlewares[middlewares.length - 1];
    await middleware?.({}, {}, next);
    await Promise.resolve();

    expect(writeResponseToNodeResponse).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when no response is returned', async () => {
    handleMock.mockResolvedValue(null);

    await import('./server');

    const next = vi.fn();
    const middleware = middlewares[middlewares.length - 1];
    await middleware?.({}, {}, next);
    await Promise.resolve();

    expect(next).toHaveBeenCalled();
  });

  it('forwards errors to next on rejection', async () => {
    const err = new Error('boom');
    handleMock.mockRejectedValue(err);

    await import('./server');

    const next = vi.fn();
    const middleware = middlewares[middlewares.length - 1];
    await middleware?.({}, {}, next);
    await Promise.resolve();

    expect(next).toHaveBeenCalledWith(err);
  });

  it('starts the server when running as main module', async () => {
    process.env['pm_id'] = '1';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await import('./server');

    expect(lastApp.listen).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('throws when listen callback receives an error', async () => {
    process.env['pm_id'] = '1';
    const app: MockExpressApp = {
      use: vi.fn(),
      listen: vi.fn((_port: number, cb?: (err?: Error) => void) => {
        if (cb) cb(new Error('listen failed'));
      }),
    };
    lastApp = app;
    expressMock.mockImplementationOnce(() => app);

    await expect(import('./server')).rejects.toThrow('listen failed');
  });
});
