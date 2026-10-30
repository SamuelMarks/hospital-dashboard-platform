/**
 * @fileoverview Unit tests for ConversationComponent.
 * Verifies message rendering, sql execution, and interactions.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConversationComponent } from './conversation.component';
import { ChatStore } from '../chat.store';
import { AskDataService } from '../../global/ask-data.service';
import { ElementRef, signal, WritableSignal, NO_ERRORS_SCHEMA } from '@angular/core';
import { By } from '@angular/platform-browser';
import { MessageResponse } from '../../api-client';
import { ArenaSqlService } from '../arena-sql.service';
import { QueryCartService } from '../../global/query-cart.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { readTemplate } from '../../../test-utils/component-resources';
import { createMockCandidate, createMockMessage } from '../../../test-utils/mock-factories';
import { SqlSnippetComponent } from './sql-snippet.component';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';

describe('ConversationComponent', () => {
  let component: ConversationComponent;
  let fixture: ComponentFixture<ConversationComponent>;
  let mockStore: {
    messages: WritableSignal<MessageResponse[]>;
    isGenerating: WritableSignal<boolean>;
    isStreaming: WritableSignal<boolean>;
    streamingMessageContent: WritableSignal<string | null>;
    error: WritableSignal<string | null>;
    availableModels: WritableSignal<unknown[]>;
    selectedModelIds: WritableSignal<string[]>;
    toggleModelSelection: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    streamResponse: ReturnType<typeof vi.fn>;
    voteCandidate: ReturnType<typeof vi.fn>;
  };
  let mockScratchpad: { open: ReturnType<typeof vi.fn> };
  let mockArenaSql: { execute: ReturnType<typeof vi.fn> };
  let mockCart: { add: ReturnType<typeof vi.fn> };
  let mockSnackBar: { open: ReturnType<typeof vi.fn> };
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };
  let messagesSig: WritableSignal<MessageResponse[]>;

  beforeEach(async () => {
    messagesSig = signal([]);
    mockStore = {
      messages: messagesSig,
      isGenerating: signal(false),
      isStreaming: signal(false),
      streamingMessageContent: signal(null),
      error: signal(null),
      availableModels: signal([]),
      selectedModelIds: signal([]),
      toggleModelSelection: vi.fn(),
      sendMessage: vi.fn(),
      streamResponse: vi.fn(),
      voteCandidate: vi.fn(),
    };
    mockScratchpad = { open: vi.fn() };
    mockArenaSql = { execute: vi.fn().mockReturnValue(of({ data: [], columns: [] })) };
    mockCart = { add: vi.fn() };
    mockSnackBar = { open: vi.fn() };
    mockRouter = { navigate: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ConversationComponent],
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
    const cand = createMockCandidate({ id: 'c9', sql_snippet: 'SELECT 1' });
    component.runCandidateQuery(cand);

    expect(mockArenaSql.execute).toHaveBeenCalledWith({ sql: 'SELECT 1', max_rows: 200 });
    expect(component.candidateResults()['c9']).toBeTruthy();
  });

  it('should handle candidate execution error', () => {
    const cand = createMockCandidate({ id: 'c10', sql_snippet: 'SELECT error' });
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

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/optimization'], {
      queryParams: { prompt: 'SELECT * FROM patients' },
    });
  });

  it('should do nothing if simulate is called with empty sql', () => {
    component.simulateQuery('');
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  describe('handleEnter and send', () => {
    it('should not send if shift key is pressed', () => {
      const e = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true });
      const preventSpy = vi.spyOn(e, 'preventDefault');
      component.handleEnter(e);
      expect(preventSpy).not.toHaveBeenCalled();
      expect(mockStore.sendMessage).not.toHaveBeenCalled();
    });

    it('should send and clear inputText if valid', () => {
      component.inputText.set('Hello');
      const e = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false, cancelable: true });
      const preventSpy = vi.spyOn(e, 'preventDefault');
      component.handleEnter(e);
      expect(preventSpy).toHaveBeenCalled();
      expect(mockStore.sendMessage).toHaveBeenCalledWith('Hello');
      expect(component.inputText()).toBe('');
    });

    it('should not send if inputText is empty', () => {
      component.inputText.set('   ');
      component.send();
      expect(mockStore.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('cleanContent and cleanContentSimple', () => {
    it('cleanContent: should return empty string if content and snippet are empty', () => {
      expect(component.cleanContent(createMockMessage({ content: '   ' }))).toBe('');
    });
    it('cleanContent: should handle missing content gracefully', () => {
      expect(component.cleanContent(createMockMessage({ content: '' }))).toBe('');
    });
    it('cleanContent: should return content if no sql_snippet', () => {
      expect(component.cleanContent(createMockMessage({ content: 'hi' }))).toBe('hi');
    });
    it('cleanContent: should strip sql block if sql_snippet exists', () => {
      expect(
        component.cleanContent(
          createMockMessage({
            content: `test \`\`\`sql 
 SELECT 1 
 \`\`\` end`,
            sql_snippet: 'a',
          }),
        ),
      ).toBe('test  end');
    });
    it('cleanContentSimple: should strip sql block and handle empty', () => {
      expect(
        component.cleanContentSimple(`test \`\`\`sql
 SELECT 
\`\`\``),
      ).toBe('test');
      expect(component.cleanContentSimple(null)).toBe('');
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
      component.runCandidateQuery(createMockCandidate({ id: 'c1', sql_snippet: '   ' }));
      expect(mockArenaSql.execute).not.toHaveBeenCalled();
    });

    it('should early exit if sql is missing', () => {
      component.runCandidateQuery(createMockCandidate({ id: 'c1', sql_snippet: null }));
      expect(mockArenaSql.execute).not.toHaveBeenCalled();
    });

    it('should early exit if already loading', () => {
      component.candidateLoading.set({ c1: true });
      component.runCandidateQuery(createMockCandidate({ id: 'c1', sql_snippet: 'SELECT 1' }));
      expect(mockArenaSql.execute).not.toHaveBeenCalled();
    });

    it('should set error if res.error is present', () => {
      mockArenaSql.execute.mockReturnValue(of({ error: 'Some err' }));
      component.runCandidateQuery(createMockCandidate({ id: 'c1', sql_snippet: 'SELECT 1' }));
      expect(component.candidateErrors()['c1']).toBe('Some err');
      expect(component.candidateResults()['c1']).toBeNull();
    });

    it('should handle status 0 error', () => {
      mockArenaSql.execute.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      component.runCandidateQuery(createMockCandidate({ id: 'c1', sql_snippet: 'SELECT 1' }));
      expect(component.candidateErrors()['c1']).toBe('Network Error: Cannot reach server.');
    });

    it('should handle error without detail', () => {
      mockArenaSql.execute.mockReturnValue(throwError(() => new Error('Generic error')));
      component.runCandidateQuery(createMockCandidate({ id: 'c1', sql_snippet: 'SELECT 1' }));
      expect(component.candidateErrors()['c1']).toBe('Generic error');
    });

    it('should handle error without message', () => {
      mockArenaSql.execute.mockReturnValue(throwError(() => ({})));
      component.runCandidateQuery(createMockCandidate({ id: 'c1', sql_snippet: 'SELECT 1' }));
      expect(component.candidateErrors()['c1']).toBe('Unknown error');
    });
  });

  describe('runAllCandidates', () => {
    it('should do nothing if no candidates', () => {
      const msg = createMockMessage();
      delete msg.candidates;
      component.runAllCandidates(msg);
      expect(mockArenaSql.execute).not.toHaveBeenCalled();
    });
    it('should run for each candidate', () => {
      component.runAllCandidates(
        createMockMessage({
          candidates: [
            createMockCandidate({ id: '1', sql_snippet: 's1' }),
            createMockCandidate({ id: '2', sql_snippet: 's2' }),
          ],
        }),
      );
      expect(mockArenaSql.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('sqlGroupCount', () => {
    it('should return 0 if no sql_hash or no candidates', () => {
      const msgNoCands = createMockMessage();
      delete msgNoCands.candidates;
      expect(component.sqlGroupCount(msgNoCands, createMockCandidate({ sql_hash: 'a' }))).toBe(0);
      expect(
        component.sqlGroupCount(
          createMockMessage({ candidates: [] }),
          createMockCandidate({ sql_hash: null }),
        ),
      ).toBe(0);
    });
    it('should return matching count', () => {
      expect(
        component.sqlGroupCount(
          createMockMessage({
            candidates: [
              createMockCandidate({ sql_hash: 'a' }),
              createMockCandidate({ sql_hash: 'a' }),
              createMockCandidate({ sql_hash: 'b' }),
            ],
          }),
          createMockCandidate({ sql_hash: 'a' }),
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
      component.candidateResults.set({ c1: { data: [], columns: [] } });
      expect(component.candidateResult('c1')).toEqual({ data: [], columns: [] });
      expect(component.candidateResult('c2')).toBeNull();
    });
  });

  describe('hasPendingCandidates', () => {
    it('should return false if not assistant or no candidates', () => {
      expect(component.hasPendingCandidates(createMockMessage({ role: 'user' }))).toBe(false);
      expect(
        component.hasPendingCandidates(createMockMessage({ role: 'assistant', candidates: [] })),
      ).toBe(false);
    });
    it('should return true if none selected', () => {
      expect(
        component.hasPendingCandidates(
          createMockMessage({
            role: 'assistant',
            candidates: [createMockCandidate({ is_selected: false })],
          }),
        ),
      ).toBe(true);
    });
    it('should return true if some selected but content is empty', () => {
      expect(
        component.hasPendingCandidates(
          createMockMessage({
            role: 'assistant',
            content: '   ',
            candidates: [createMockCandidate({ is_selected: true })],
          }),
        ),
      ).toBe(true);
    });
    it('should return false if some selected and content is present', () => {
      expect(
        component.hasPendingCandidates(
          createMockMessage({
            role: 'assistant',
            content: 'hi',
            candidates: [createMockCandidate({ is_selected: true })],
          }),
        ),
      ).toBe(false);
    });
  });

  describe('hasSqlCandidates', () => {
    it('should return true if any candidate has sql_snippet', () => {
      expect(
        component.hasSqlCandidates(
          createMockMessage({
            candidates: [
              createMockCandidate({ sql_snippet: '' }),
              createMockCandidate({ sql_snippet: 'select' }),
            ],
          }),
        ),
      ).toBe(true);
    });
    it('should return false if none have sql_snippet or no candidates', () => {
      expect(
        component.hasSqlCandidates(
          createMockMessage({ candidates: [createMockCandidate({ sql_snippet: '' })] }),
        ),
      ).toBe(false);
      const msgNoCands = createMockMessage();
      delete msgNoCands.candidates;
      expect(component.hasSqlCandidates(msgNoCands)).toBe(false);
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
      const div = document.createElement('div');
      Object.defineProperty(div, 'scrollHeight', { value: 100 });
      const mockEl = new ElementRef<HTMLElement>(div);
      vi.spyOn(component, 'scrollContainer').mockReturnValue(mockEl);
      component.scrollToBottom();
      vi.advanceTimersByTime(50);
      expect(div.scrollTop).toBe(100);
      vi.useRealTimers();
    });
    it('should do nothing if scrollContainer is missing', () => {
      vi.useFakeTimers();
      vi.spyOn(component, 'scrollContainer').mockReturnValue(undefined);
      component.scrollToBottom();
      vi.advanceTimersByTime(50);
      vi.useRealTimers();
    });
  });

  describe('streaming mode', () => {
    it('renders streaming message bubble when isStreaming is true', () => {
      mockStore.isStreaming.set(true);
      mockStore.streamingMessageContent.set('Streaming token content');
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.streaming-content')).toBeTruthy();
      expect(el.querySelector('.streaming-content viz-markdown')).toBeTruthy();
      expect(el.querySelector('mat-progress-bar')).toBeTruthy();
    });
  });
});
