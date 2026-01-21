/**
 * @fileoverview Unit tests for ConversationComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConversationComponent } from './conversation.component';
import { ChatStore } from '../chat.store';
import { AskDataService } from '../../global/ask-data.service';
import { signal, WritableSignal } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { MessageResponse } from '../../api-client';

describe('ConversationComponent', () => {
  let component: ConversationComponent;
  let fixture: ComponentFixture<ConversationComponent>;

  let mockStore: any;
  let mockScratchpad: any;

  // Signals
  let messagesSig: WritableSignal<MessageResponse[]>;
  let isGeneratingSig: WritableSignal<boolean>;
  let errorSig: WritableSignal<string | null>;

  beforeEach(async () => {
    messagesSig = signal([]);
    isGeneratingSig = signal(false);
    errorSig = signal(null);

    mockStore = {
      messages: messagesSig,
      isGenerating: isGeneratingSig,
      error: errorSig,
      sendMessage: vi.fn()
    };

    mockScratchpad = {
      open: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [ConversationComponent, NoopAnimationsModule],
      providers: [
        { provide: ChatStore, useValue: mockStore },
        { provide: AskDataService, useValue: mockScratchpad }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ConversationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render messages with correct alignment', () => {
    messagesSig.set([
      { id: '1', role: 'user', content: 'Hi', created_at: '' } as any,
      { id: '2', role: 'assistant', content: 'Hello', created_at: '' } as any
    ]);
    fixture.detectChanges();

    const bubbles = fixture.debugElement.queryAll(By.css('.bubble-row'));
    expect(bubbles.length).toBe(2);
    expect(bubbles[0].classes['user']).toBe(true);
    expect(bubbles[1].classes['assistant']).toBe(true);
  });

  it('should render SQL Snippet if present', () => {
    messagesSig.set([
      { id: '1', role: 'assistant', content: 'Here is code', sql_snippet: 'SELECT 1', created_at: '' } as any
    ]);
    fixture.detectChanges();

    const snippet = fixture.debugElement.query(By.css('app-sql-snippet'));
    expect(snippet).toBeTruthy();
  });

  it('should clean content by removing code blocks', () => {
    const msg = {
      id: '1',
      role: 'ai',
      content: 'Here is the SQL:\n```sql\nSELECT *\n```\nEnjoy.',
      sql_snippet: 'SELECT *',
      created_at: ''
    } as any;

    const cleaned = component.cleanContent(msg);
    expect(cleaned).not.toContain('```sql');
    expect(cleaned).toContain('Here is the SQL:');
    expect(cleaned).toContain('Enjoy');
  });

  it('should send message on button click', () => {
    component.inputText = 'Query';
    fixture.detectChanges();

    const btn = fixture.debugElement.query(By.css('button[aria-label="Send Message"]'));
    btn.triggerEventHandler('click', null);

    expect(mockStore.sendMessage).toHaveBeenCalledWith('Query');
    expect(component.inputText).toBe(''); // Reset
  });

  it('should disable input while generating', async () => {
    isGeneratingSig.set(true);
    fixture.detectChanges();
    await fixture.whenStable(); // Ensure binding updates

    const textarea = fixture.debugElement.query(By.css('textarea'));
    expect(textarea.nativeElement.disabled).toBe(true);
  });

  it('should open scratchpad when snippet run is clicked', () => {
    component.runQuery('SELECT 1');
    expect(mockScratchpad.open).toHaveBeenCalled();
  });
});