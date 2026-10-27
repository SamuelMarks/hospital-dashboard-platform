/* @vitest-environment node */
/**
 * @fileoverview Unit tests for the Express SSR server (`src/server.ts`).
 */

import { vi } from 'vitest';

const handleMock = vi.fn();
const writeResponseMock = vi.fn();
const isMainModuleMock = vi.fn(() => false);

vi.mock('@angular/ssr/node', () => ({
  AngularNodeAppEngine: class {
    handle = handleMock;
  },
  createNodeRequestHandler: vi.fn((expressApp: unknown) => expressApp),
  isMainModule: isMainModuleMock,
  writeResponseToNodeResponse: writeResponseMock,
}));

describe('server.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['pm_id'];
    delete process.env['PORT'];
  });

  it('configures real Express app, executes ssrMiddleware, and handles responses and errors', async () => {
    const mod = await import('./server');
    expect(mod.app).toBeDefined();
    expect(mod.browserDistFolder).toContain('browser');
    expect(mod.reqHandler).toBe(mod.app);

    const next = vi.fn();
    const fakeReq = {} as Parameters<typeof mod.ssrMiddleware>[0];
    const fakeRes = {} as Parameters<typeof mod.ssrMiddleware>[1];

    // 1. SSR engine returns a rendered response
    const renderedResponse = { status: 200 };
    handleMock.mockResolvedValueOnce(renderedResponse);
    await mod.ssrMiddleware(fakeReq, fakeRes, next);
    expect(writeResponseMock).toHaveBeenCalledWith(renderedResponse, fakeRes);
    expect(next).not.toHaveBeenCalled();

    // 2. SSR engine returns null -> falls through to next()
    handleMock.mockResolvedValueOnce(null);
    await mod.ssrMiddleware(fakeReq, fakeRes, next);
    expect(next).toHaveBeenCalledTimes(1);

    // 3. SSR engine rejects -> forwards error to next(err)
    const err = new Error('ssr failure');
    handleMock.mockRejectedValueOnce(err);
    await mod.ssrMiddleware(fakeReq, fakeRes, next);
    expect(next).toHaveBeenCalledWith(err);
  });

  it('starts listening on PORT or default 4000 when mainCheck or pm_id is active and handles listen errors', async () => {
    const mod = await import('./server');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    let capturedCallback: ((error?: Error) => void) | undefined;
    const fakeExpressApp = {
      listen: vi.fn((_port: string | number, cb?: (error?: Error) => void) => {
        capturedCallback = cb;
        return {} as ReturnType<typeof mod.app.listen>;
      }),
    };

    mod.startServerIfNeeded(false, {}, fakeExpressApp);
    expect(fakeExpressApp.listen).not.toHaveBeenCalled();

    mod.startServerIfNeeded(true, { PORT: '5050' }, fakeExpressApp);
    expect(fakeExpressApp.listen).toHaveBeenCalledWith('5050', expect.any(Function));
    expect(capturedCallback).toBeDefined();
    if (capturedCallback) {
      capturedCallback(undefined);
    }
    expect(logSpy).toHaveBeenCalledWith('Node Express server listening on http://localhost:5050');

    mod.startServerIfNeeded(false, { pm_id: '1' }, fakeExpressApp);
    expect(fakeExpressApp.listen).toHaveBeenCalledWith(4000, expect.any(Function));

    expect(() => mod.onServerListen(4000, new Error('listen failed'))).toThrow('listen failed');
    logSpy.mockRestore();
  });
});
