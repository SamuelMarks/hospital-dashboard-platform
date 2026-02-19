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
import { HttpErrorResponse } from '@angular/common/http';

// Mocks
@Component({ selector: 'viz-markdown', template: '' })
class MockVizMarkdownComponent {
  readonly content = input<string>('');
}

@Component({
  selector: 'app-sql-snippet',
  template:
    '<button class="run-btn" (click)="run.emit(sql())"></button><button class="cart-btn" (click)="addToCart.emit(sql())"></button>',
})
class MockSqlSnippetComponent {
  readonly sql = input<string>('');
  readonly run = output<string>();
  readonly addToCart = output<string>();
}

describe('ConversationComponent', () => {
  let component: ConversationComponent;
  let fixture: ComponentFixture<ConversationComponent>;
  let mockStore: any;
  let mockScratchpad: any;
  let mockArenaSql: any;
  let mockCart: any;
  let mockSnackBar: any;
  let messagesSig: WritableSignal<MessageResponse[]>;

  beforeEach(async () => {
    messagesSig = signal([]);
    mockStore = {
      messages: messagesSig,
      isGenerating: signal(false),
      error: signal(null),
      // Add missing mocks for the template
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

    await TestBed.configureTestingModule({
      imports: [ConversationComponent, NoopAnimationsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: ChatStore, useValue: mockStore },
        { provide: AskDataService, useValue: mockScratchpad },
        { provide: ArenaSqlService, useValue: mockArenaSql },
        { provide: QueryCartService, useValue: mockCart },
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    })
      // Replace with mock snippet to test outputs
      // FIX: Explicitly remove the real components to avoid selector collision
      .overrideComponent(ConversationComponent, {
        remove: { imports: [SqlSnippetComponent, VizMarkdownComponent] },
        add: { imports: [MockVizMarkdownComponent, MockSqlSnippetComponent] },
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

    const cartBtn = fixture.debugElement.query(By.css('.cart-btn'));
    cartBtn.triggerEventHandler('click', null);

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

    const cartBtn = fixture.debugElement.query(By.css('.candidate-body .cart-btn'));
    expect(cartBtn).toBeTruthy();
    cartBtn.triggerEventHandler('click', null);

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
});
