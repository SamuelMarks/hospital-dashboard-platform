import { AnalyticsService } from './analytics.service';
import { environment } from '../../environments/environment';
import { of } from 'rxjs';
import { vi } from 'vitest';

describe('AnalyticsService', () => {
  it('uses BASE_PATH when provided', () => {
    const http = { get: vi.fn().mockReturnValue(of([])) } as any;
    const service = new AnalyticsService(http, 'http://api.test');

    service.listLlmOutputs(10, 5).subscribe();

    const [url, options] = http.get.mock.calls[0];
    expect(url).toBe('http://api.test/api/v1/analytics/llm');
    expect(options.params.toString()).toBe('limit=10&offset=5');
  });

  it('uses BASE_PATH arrays by taking the first entry', () => {
    const http = { get: vi.fn().mockReturnValue(of([])) } as any;
    const service = new AnalyticsService(http, ['http://array.test', 'http://fallback.test']);

    service.listLlmOutputs(1, 0).subscribe();

    const [url, options] = http.get.mock.calls[0];
    expect(url).toBe('http://array.test/api/v1/analytics/llm');
    expect(options.params.toString()).toBe('limit=1&offset=0');
  });

  it('falls back to environment apiUrl when base path is missing', () => {
    const http = { get: vi.fn().mockReturnValue(of([])) } as any;
    const service = new AnalyticsService(http);

    service.listLlmOutputs().subscribe();

    const [url, options] = http.get.mock.calls[0];
    expect(url).toBe(`${environment.apiUrl}/api/v1/analytics/llm`);
    expect(options.params.toString()).toBe('limit=500&offset=0');
  });

  it('falls back to localhost when environment apiUrl is empty', () => {
    const http = { get: vi.fn().mockReturnValue(of([])) } as any;
    const original = environment.apiUrl;
    (environment as any).apiUrl = '';

    const service = new AnalyticsService(http);
    service.listLlmOutputs().subscribe();

    const [url] = http.get.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/v1/analytics/llm');

    (environment as any).apiUrl = original;
  });
});
