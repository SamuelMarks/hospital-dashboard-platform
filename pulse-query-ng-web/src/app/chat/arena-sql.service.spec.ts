/**
 * @fileoverview Unit tests for `ArenaSqlService`.
 */

import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi, type Mock } from 'vitest';
import { ArenaSqlService, SqlExecutionRequest, SqlExecutionResponse } from './arena-sql.service';
import { AiService } from '../api-client';

describe('ArenaSqlService', () => {
  let service: ArenaSqlService;
  let mockAiService: { executeSqlPreviewApiV1AiExecutePost: Mock };

  beforeEach(() => {
    mockAiService = {
      executeSqlPreviewApiV1AiExecutePost: vi
        .fn()
        .mockReturnValue(of({ data: [], columns: [], error: null })),
    };

    TestBed.configureTestingModule({
      providers: [ArenaSqlService, { provide: AiService, useValue: mockAiService }],
    });
    service = TestBed.inject(ArenaSqlService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('delegates execute() to AiService.executeSqlPreviewApiV1AiExecutePost', () => {
    const payload: SqlExecutionRequest = { sql: 'SELECT 1', max_rows: 10 };
    const expected: SqlExecutionResponse = {
      data: [{ val: 1 }],
      columns: ['val'],
      error: null,
    };
    mockAiService.executeSqlPreviewApiV1AiExecutePost.mockReturnValue(of(expected));

    let actual: SqlExecutionResponse | undefined;
    service.execute(payload).subscribe((res) => {
      actual = res;
    });

    expect(mockAiService.executeSqlPreviewApiV1AiExecutePost).toHaveBeenCalledWith(payload);
    expect(actual).toEqual(expected);
  });
});
