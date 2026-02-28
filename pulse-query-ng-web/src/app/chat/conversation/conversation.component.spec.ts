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
});
