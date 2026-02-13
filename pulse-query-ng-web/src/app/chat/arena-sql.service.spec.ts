import { ArenaSqlService, SqlExecutionRequest } from './arena-sql.service';
import { environment } from '../../environments/environment';
import { of } from 'rxjs';
import { vi } from 'vitest';

describe('ArenaSqlService', () => {
  it('posts to the execute endpoint with BASE_PATH', () => {
    const http = { post: vi.fn().mockReturnValue(of({ data: [], columns: [] })) } as any;
    const service = new ArenaSqlService(http, ['http://api.test']);

    const payload: SqlExecutionRequest = { sql: 'SELECT 1', max_rows: 10 };
    service.execute(payload).subscribe();

    const [url, body] = http.post.mock.calls[0];
    expect(url).toBe('http://api.test/api/v1/ai/execute');
    expect(body).toEqual(payload);
  });

  it('accepts BASE_PATH as a string', () => {
    const http = { post: vi.fn().mockReturnValue(of({ data: [], columns: [] })) } as any;
    const service = new ArenaSqlService(http, 'http://string.test');

    service.execute({ sql: 'SELECT 2' }).subscribe();

    const [url] = http.post.mock.calls[0];
    expect(url).toBe('http://string.test/api/v1/ai/execute');
  });

  it('falls back to environment apiUrl when base path is missing', () => {
    const http = { post: vi.fn().mockReturnValue(of({ data: [], columns: [] })) } as any;
    const service = new ArenaSqlService(http);

    service.execute({ sql: 'SELECT 1' }).subscribe();

    const [url] = http.post.mock.calls[0];
    expect(url).toBe(`${environment.apiUrl}/api/v1/ai/execute`);
  });

  it('falls back to localhost when environment apiUrl is empty', () => {
    const http = { post: vi.fn().mockReturnValue(of({ data: [], columns: [] })) } as any;
    const original = environment.apiUrl;
    (environment as any).apiUrl = '';

    const service = new ArenaSqlService(http);
    service.execute({ sql: 'SELECT 3' }).subscribe();

    const [url] = http.post.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/v1/ai/execute');

    (environment as any).apiUrl = original;
  });
});
