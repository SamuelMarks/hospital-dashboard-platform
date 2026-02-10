import { appConfig } from './app.config';
import { config } from './app.config.server';

describe('server app config', () => {
  it('merges server providers with base app config', () => {
    expect(config).toBeTruthy();
    expect(Array.isArray(config.providers)).toBe(true);
    expect(config.providers?.length).toBeGreaterThan(appConfig.providers?.length || 0);
  });
});
