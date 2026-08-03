/**
 * @fileoverview Unit tests for ConversationComponent.
 * Verifies message rendering, sql execution, and interactions.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConversationComponent } from './conversation.component';
import { ChatStore } from '../chat.store';
import { AskDataService } from '../../global/ask-data.service';
import { Component, input, output, signal, WritableSignal, NO_ERRORS_SCHEMA } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { MessageResponse } from '../../api-client';
import { ArenaSqlService } from '../arena-sql.service';
import { QueryCartService } from '../../global/query-cart.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { readTemplate } from '../../../test-utils/component-resources';
import { VizMarkdownComponent } from '../../shared/visualizations/viz-markdown/viz-markdown.component';
import { SqlSnippetComponent } from './sql-snippet.component';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';

describe('ConversationComponent', () => {
  let component: ConversationComponent;
  let fixture: ComponentFixture<ConversationComponent>;
  let mockStore: any;
  let mockScratchpad: any;
  let mockArenaSql: any;
  let mockCart: any;
  let mockSnackBar: any;
  let mockRouter: any;
  let messagesSig: WritableSignal<MessageResponse[]>;

  beforeEach(async () => {
    messagesSig = signal([]);
    mockStore = {
      messages: messagesSig,
      isGenerating: signal(false),
      error: signal(null),
      availableModels: signal([]),
      selectedModelIds: signal([]),
      toggleModelSelection: vi.fn(),
      sendMessage: vi.fn(),
      voteCandidate: vi.fn(),
    };
    mockScratchpad = { open: vi.fn() };
    mockArenaSql = { execute: vi.fn().mockReturnValue(of({ data: [], columns: [] })) };
    mockCart = { add: vi.fn() };
    mockSnackBar = { open: vi.fn() };
    mockRouter = { navigate: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ConversationComponent, NoopAnimationsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ChatStore, useValue: mockStore },
        { provide: AskDataService, useValue: mockScratchpad },
        { provide: ArenaSqlService, useValue: mockArenaSql },
        { provide: QueryCartService, useValue: mockCart },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: Router, useValue: mockRouter },
      ],
    })
      .overrideComponent(ConversationComponent, {
        set: { template: readTemplate('./conversation.component.html') },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ConversationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should call saveToCart when snippet emits addToCart', () => {
    const msg: MessageResponse = {
      id: 'm1',
      conversation_id: 'c1',
      role: 'assistant',
      content: 'Here is SQL',
      sql_snippet: 'SELECT 1',
      created_at: '',
    };
    messagesSig.set([msg]);
    fixture.detectChanges();

    const snippet = fixture.debugElement.query(By.directive(SqlSnippetComponent));
    snippet.triggerEventHandler('addToCart', 'SELECT 1');

    expect(mockCart.add).toHaveBeenCalledWith('SELECT 1');
    expect(mockSnackBar.open).toHaveBeenCalledWith(
      expect.stringContaining('Saved'),
      'OK',
      expect.anything(),
    );
  });

  it('should call saveToCart for Candidates too', () => {
    const msg: MessageResponse = {
      id: 'm2',
      conversation_id: 'c1',
      role: 'assistant',
      content: 'Candidates',
      created_at: '',
      candidates: [
        { id: 'c1', content: 'A', model_name: 'M1', sql_snippet: 'SELECT C', is_selected: false },
      ],
    };
    messagesSig.set([msg]);
    fixture.detectChanges();

    const snippet = fixture.debugElement.query(By.directive(SqlSnippetComponent));
    snippet.triggerEventHandler('addToCart', 'SELECT C');

    expect(mockCart.add).toHaveBeenCalledWith('SELECT C');
  });

  it('should run candidate query via ArenaSql service', () => {
    const cand = { id: 'c9', sql_snippet: 'SELECT 1' } as any;
    component.runCandidateQuery(cand);

    expect(mockArenaSql.execute).toHaveBeenCalledWith({ sql: 'SELECT 1', max_rows: 200 });
    expect(component.candidateResults()['c9']).toBeTruthy();
  });

  it('should handle candidate execution error', () => {
    const cand = { id: 'c10', sql_snippet: 'SELECT error' } as any;
    mockArenaSql.execute.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, error: { detail: 'Boom' } })),
    );

    component.runCandidateQuery(cand);

    expect(component.candidateErrors()['c10']).toBe('Boom');
    expect(component.candidateLoading()['c10']).toBe(false);
  });

  it('should navigate to simulation on simulate event', () => {
    const msg: MessageResponse = {
      id: 'm3',
      conversation_id: 'c1',
      role: 'assistant',
      content: 'Here is SQL',
      sql_snippet: 'SELECT * FROM patients',
      created_at: '',
    };
    messagesSig.set([msg]);
    fixture.detectChanges();

    const snippet = fixture.debugElement.query(By.directive(SqlSnippetComponent));
    snippet.triggerEventHandler('simulate', 'SELECT * FROM patients');

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/simulation'], {
      queryParams: { sql: 'SELECT * FROM patients' },
    });
  });

  it('should do nothing if simulate is called with empty sql', () => {
    component.simulateQuery('');
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  describe('handleEnter and send', () => {
    it('should not send if shift key is pressed', () => {
      const e = { shiftKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent;
      component.handleEnter(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(mockStore.sendMessage).not.toHaveBeenCalled();
    });

    it('should send and clear inputText if valid', () => {
      component.inputText = 'Hello';
      const e = { shiftKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent;
      component.handleEnter(e);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(mockStore.sendMessage).toHaveBeenCalledWith('Hello');
      expect(component.inputText).toBe('');
    });

    it('should not send if inputText is empty', () => {
      component.inputText = '   ';
      component.send();
      expect(mockStore.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('cleanContent and cleanContentSimple', () => {
    it('cleanContent: should return empty string if content and snippet are empty', () => {
      expect(component.cleanContent({ content: '   ' } as any)).toBe('');
    });
    it('cleanContent: should handle missing content gracefully', () => {
      expect(component.cleanContent({} as any)).toBe('');
    });
    it('cleanContent: should return content if no sql_snippet', () => {
      expect(component.cleanContent({ content: 'hi' } as any)).toBe('hi');
    });
    it('cleanContent: should strip sql block if sql_snippet exists', () => {
      expect(
        component.cleanContent({
          content: 'test ```sql \n SELECT 1 \n ``` end',
          sql_snippet: 'a',
        } as any),
      ).toBe('test  end');
    });
    it('cleanContentSimple: should strip sql block and handle empty', () => {
      expect(component.cleanContentSimple('test ```sql\n SELECT \n```')).toBe('test');
      expect(component.cleanContentSimple(null as any)).toBe('');
    });
  });

  describe('runQuery', () => {
    it('should open scratchpad', () => {
      component.runQuery('SELECT');
      expect(mockScratchpad.open).toHaveBeenCalled();
    });
  });

  describe('saveToCart', () => {
    it('should not add if sql is empty', () => {
      component.saveToCart('');
      expect(mockCart.add).not.toHaveBeenCalled();
    });
  });

  describe('runCandidateQuery', () => {
    it('should early exit if sql is empty', () => {
      component.runCandidateQuery({ id: 'c1', sql_snippet: '   ' } as any);
      expect(mockArenaSql.execute).not.toHaveBeenCalled();
    });

    it('should early exit if sql is missing', () => {
      component.runCandidateQuery({ id: 'c1' } as any);
      expect(mockArenaSql.execute).not.toHaveBeenCalled();
    });

    it('should early exit if already loading', () => {
      component.candidateLoading.set({ c1: true });
      component.runCandidateQuery({ id: 'c1', sql_snippet: 'SELECT 1' } as any);
      expect(mockArenaSql.execute).not.toHaveBeenCalled();
    });

    it('should set error if res.error is present', () => {
      mockArenaSql.execute.mockReturnValue(of({ error: 'Some err' }));
      component.runCandidateQuery({ id: 'c1', sql_snippet: 'SELECT 1' } as any);
      expect(component.candidateErrors()['c1']).toBe('Some err');
      expect(component.candidateResults()['c1']).toBeNull();
    });

    it('should handle status 0 error', () => {
      mockArenaSql.execute.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      component.runCandidateQuery({ id: 'c1', sql_snippet: 'SELECT 1' } as any);
      expect(component.candidateErrors()['c1']).toBe('Network Error: Cannot reach server.');
    });

    it('should handle error without detail', () => {
      mockArenaSql.execute.mockReturnValue(throwError(() => new Error('Generic error')));
      component.runCandidateQuery({ id: 'c1', sql_snippet: 'SELECT 1' } as any);
      expect(component.candidateErrors()['c1']).toBe('Generic error');
    });

    it('should handle error without message', () => {
      mockArenaSql.execute.mockReturnValue(throwError(() => ({})));
      component.runCandidateQuery({ id: 'c1', sql_snippet: 'SELECT 1' } as any);
      expect(component.candidateErrors()['c1']).toBe('Unknown error');
    });
  });

  describe('runAllCandidates', () => {
    it('should do nothing if no candidates', () => {
      component.runAllCandidates({} as any);
      expect(mockArenaSql.execute).not.toHaveBeenCalled();
    });
    it('should run for each candidate', () => {
      component.runAllCandidates({
        candidates: [
          { id: '1', sql_snippet: 's1' },
          { id: '2', sql_snippet: 's2' },
        ],
      } as any);
      expect(mockArenaSql.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('sqlGroupCount', () => {
    it('should return 0 if no sql_hash or no candidates', () => {
      expect(component.sqlGroupCount({} as any, { sql_hash: 'a' } as any)).toBe(0);
      expect(component.sqlGroupCount({ candidates: [] } as any, {} as any)).toBe(0);
    });
    it('should return matching count', () => {
      expect(
        component.sqlGroupCount(
          { candidates: [{ sql_hash: 'a' }, { sql_hash: 'a' }, { sql_hash: 'b' }] } as any,
          { sql_hash: 'a' } as any,
        ),
      ).toBe(2);
    });
  });

  describe('candidate accessors', () => {
    it('isCandidateLoading', () => {
      component.candidateLoading.set({ c1: true });
      expect(component.isCandidateLoading('c1')).toBe(true);
      expect(component.isCandidateLoading('c2')).toBe(false);
    });
    it('candidateError', () => {
      component.candidateErrors.set({ c1: 'err' });
      expect(component.candidateError('c1')).toBe('err');
      expect(component.candidateError('c2')).toBeNull();
    });
    it('candidateResult', () => {
      component.candidateResults.set({ c1: { data: [], columns: [] } as any });
      expect(component.candidateResult('c1')).toEqual({ data: [], columns: [] });
      expect(component.candidateResult('c2')).toBeNull();
    });
  });

  describe('hasPendingCandidates', () => {
    it('should return false if not assistant or no candidates', () => {
      expect(component.hasPendingCandidates({ role: 'user' } as any)).toBe(false);
      expect(component.hasPendingCandidates({ role: 'assistant', candidates: [] } as any)).toBe(
        false,
      );
    });
    it('should return true if none selected', () => {
      expect(
        component.hasPendingCandidates({
          role: 'assistant',
          candidates: [{ is_selected: false }],
        } as any),
      ).toBe(true);
    });
    it('should return true if some selected but content is empty', () => {
      expect(
        component.hasPendingCandidates({
          role: 'assistant',
          content: '   ',
          candidates: [{ is_selected: true }],
        } as any),
      ).toBe(true);
    });
    it('should return false if some selected and content is present', () => {
      expect(
        component.hasPendingCandidates({
          role: 'assistant',
          content: 'hi',
          candidates: [{ is_selected: true }],
        } as any),
      ).toBe(false);
    });
  });

  describe('hasSqlCandidates', () => {
    it('should return true if any candidate has sql_snippet', () => {
      expect(
        component.hasSqlCandidates({
          candidates: [{ sql_snippet: '' }, { sql_snippet: 'select' }],
        } as any),
      ).toBe(true);
    });
    it('should return false if none have sql_snippet or no candidates', () => {
      expect(component.hasSqlCandidates({ candidates: [{ sql_snippet: '' }] } as any)).toBe(false);
      expect(component.hasSqlCandidates({} as any)).toBe(false);
    });
  });

  describe('vote', () => {
    it('should call store.voteCandidate', () => {
      component.vote('m1', 'c1');
      expect(mockStore.voteCandidate).toHaveBeenCalledWith('m1', 'c1');
    });
  });

  describe('scrollToBottom', () => {
    it('should set scrollTop to scrollHeight if element exists', () => {
      vi.useFakeTimers();
      component['scrollContainer'] = { nativeElement: { scrollTop: 0, scrollHeight: 100 } } as any;
      component['scrollToBottom']();
      vi.advanceTimersByTime(50);
      expect(component['scrollContainer'].nativeElement.scrollTop).toBe(100);
      vi.useRealTimers();
    });
    it('should do nothing if scrollContainer is missing', () => {
      vi.useFakeTimers();
      component['scrollContainer'] = null as any;
      component['scrollToBottom']();
      vi.advanceTimersByTime(50);
      // Shouldn't crash
      vi.useRealTimers();
    });
  });
});
