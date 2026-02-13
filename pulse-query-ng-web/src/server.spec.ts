/* @vitest-environment node */
import { vi } from 'vitest';

let handleMock = vi.fn();
let middlewares: Array<Function> = [];
let lastApp: any;

const writeResponseToNodeResponse = vi.fn();
const createNodeRequestHandler = vi.fn(() => 'handler');
const isMainModule = vi.fn(() => false);

type ExpressMock = ReturnType<typeof vi.fn> & { static: ReturnType<typeof vi.fn> };

const expressMock = vi.fn(() => {
  middlewares = [];
  lastApp = {
    use: vi.fn((arg1: any, arg2?: any) => {
      const fn = typeof arg1 === 'function' ? arg1 : arg2;
      if (typeof fn === 'function') {
        middlewares.push(fn);
      }
    }),
    listen: vi.fn((port: number, cb?: (err?: Error) => void) => {
      if (cb) cb();
      return { close: vi.fn() };
    }),
  };
  return lastApp;
}) as unknown as ExpressMock;
expressMock.static = vi.fn(() => (_req: any, _res: any, next: any) => next?.());

vi.mock('express', () => ({
  default: expressMock,
}));

vi.mock('@angular/ssr/node', () => ({
  AngularNodeAppEngine: class {
    handle = (...args: any[]) => handleMock(...args);
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
    const middleware = middlewares[middlewares.length - 1] as any;
    await middleware({}, {}, next);
    await Promise.resolve();

    expect(writeResponseToNodeResponse).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when no response is returned', async () => {
    handleMock.mockResolvedValue(null);

    await import('./server');

    const next = vi.fn();
    const middleware = middlewares[middlewares.length - 1] as any;
    await middleware({}, {}, next);
    await Promise.resolve();

    expect(next).toHaveBeenCalled();
  });

  it('forwards errors to next on rejection', async () => {
    const err = new Error('boom');
    handleMock.mockRejectedValue(err);

    await import('./server');

    const next = vi.fn();
    const middleware = middlewares[middlewares.length - 1] as any;
    await middleware({}, {}, next);
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
    const app = {
      use: vi.fn(),
      listen: vi.fn((port: number, cb?: (err?: Error) => void) => {
        if (cb) cb(new Error('listen failed'));
      }),
    };
    lastApp = app;
    expressMock.mockImplementationOnce(() => app);

    await expect(import('./server')).rejects.toThrow('listen failed');
  });
});
