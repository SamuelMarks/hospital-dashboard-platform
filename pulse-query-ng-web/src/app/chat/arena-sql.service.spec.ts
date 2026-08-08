import { ArenaSqlService, SqlExecutionRequest } from './arena-sql.service';
import { environment } from '../../environments/environment';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { BASE_PATH } from '../api-client';

describe('ArenaSqlService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });
  it('posts to the execute endpoint with BASE_PATH', () => {
    const http = { post: vi.fn().mockReturnValue(of({ data: [], columns: [] })) } as any;
    TestBed.configureTestingModule({
      providers: [
        ArenaSqlService,
        { provide: HttpClient, useValue: http },
        { provide: BASE_PATH, useValue: ['http://api.test'] },
      ],
    });
    const service = TestBed.inject(ArenaSqlService);

    const payload: SqlExecutionRequest = { sql: 'SELECT 1', max_rows: 10 };
    service.execute(payload).subscribe();

    const [url, body] = http.post.mock.calls[0];
    expect(url).toBe('http://api.test/api/v1/ai/execute');
    expect(body).toEqual(payload);
  });

  it('accepts BASE_PATH as a string', () => {
    const http = { post: vi.fn().mockReturnValue(of({ data: [], columns: [] })) } as any;
    TestBed.configureTestingModule({
      providers: [
        ArenaSqlService,
        { provide: HttpClient, useValue: http },
        { provide: BASE_PATH, useValue: 'http://string.test' },
      ],
    });
    const service = TestBed.inject(ArenaSqlService);

    service.execute({ sql: 'SELECT 2' }).subscribe();

    const [url] = http.post.mock.calls[0];
    expect(url).toBe('http://string.test/api/v1/ai/execute');
  });

  it('falls back to environment apiUrl when base path is missing', () => {
    const http = { post: vi.fn().mockReturnValue(of({ data: [], columns: [] })) } as any;
    const original = environment.apiUrl;
    (environment as any).apiUrl = 'http://env.api';

    TestBed.configureTestingModule({
      providers: [ArenaSqlService, { provide: HttpClient, useValue: http }],
    });
    const service = TestBed.inject(ArenaSqlService);

    service.execute({ sql: 'SELECT 1' }).subscribe();

    const [url] = http.post.mock.calls[0];
    expect(url).toBe('http://env.api/api/v1/ai/execute');
    (environment as any).apiUrl = original;
  });

  it('falls back to localhost when environment apiUrl is empty', () => {
    const http = { post: vi.fn().mockReturnValue(of({ data: [], columns: [] })) } as any;
    const original = environment.apiUrl;
    (environment as any).apiUrl = '';

    TestBed.configureTestingModule({
      providers: [ArenaSqlService, { provide: HttpClient, useValue: http }],
    });
    const service = TestBed.inject(ArenaSqlService);
    service.execute({ sql: 'SELECT 3' }).subscribe();

    const [url] = http.post.mock.calls[0];
    expect(url).toBe('http://localhost:8000/api/v1/ai/execute');

    (environment as any).apiUrl = original;
  });
});
