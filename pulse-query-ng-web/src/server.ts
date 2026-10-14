/**
 * @fileoverview Node.js Express server entrypoint for Angular SSR and static asset serving.
 */

import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { Express, NextFunction, Request, Response } from 'express';
import { join } from 'node:path';

/** Path to the compiled browser distribution folder. */
export const browserDistFolder = join(import.meta.dirname, '../browser');

/** Express application instance. */
export const app: Express = express();

/** Angular Node SSR application engine instance. */
export const angularApp = new AngularNodeAppEngine();

/**
 * Serve static files from `/browser` with 1-year caching.
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Express middleware forwarding unhandled requests to `AngularNodeAppEngine`.
 *
 * @param req - Incoming Express request.
 * @param res - Outgoing Express response.
 * @param next - Express next middleware callback.
 * @returns Promise resolving once the SSR response is written or passed to `next()`.
 */
export function ssrMiddleware(req: Request, res: Response, next: NextFunction): Promise<unknown> {
  return angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
}

app.use(ssrMiddleware);

/**
 * Callback invoked when the Express HTTP server finishes binding or encounters an error.
 *
 * @param port - Bound port number or string.
 * @param error - Optional startup error.
 */
export function onServerListen(port: string | number, error?: Error): void {
  if (error) {
    throw error;
  }
  console.log(`Node Express server listening on http://localhost:${port}`);
}

/**
 * Starts the Express HTTP server when executed as the main module or under PM2.
 *
 * @param mainCheck - Whether the current file is the main entry module.
 * @param env - Process environment dictionary.
 * @param expressApp - Express application instance to start.
 */
export function startServerIfNeeded(
  mainCheck: boolean = isMainModule(import.meta.url),
  env: NodeJS.ProcessEnv = process.env,
  expressApp: Pick<Express, 'listen'> = app,
): void {
  if (mainCheck || Boolean(env['pm_id'])) {
    const port = env['PORT'] || 4000;
    expressApp.listen(port, (error?: Error) => onServerListen(port, error));
  }
}

startServerIfNeeded();

/**
 * Request handler used by the Angular CLI dev-server and cloud function runtimes.
 */
export const reqHandler = createNodeRequestHandler(app);
