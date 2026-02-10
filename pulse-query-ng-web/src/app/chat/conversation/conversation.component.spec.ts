import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { ConversationComponent } from './conversation.component'; 
import { ChatStore } from '../chat.store'; 
import { AskDataService } from '../../global/ask-data.service'; 
import { Component, input, output, signal, WritableSignal, NO_ERRORS_SCHEMA } from '@angular/core'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { By } from '@angular/platform-browser'; 
import { MessageResponse } from '../../api-client'; 
import { vi } from 'vitest';
import { SqlSnippetComponent } from './sql-snippet.component';
import { VizMarkdownComponent } from '../../shared/visualizations/viz-markdown/viz-markdown.component';
import { readTemplate } from '../../../test-utils/component-resources';

@Component({ selector: 'viz-markdown', template: '' })
class MockVizMarkdownComponent {
  readonly content = input<string>('');
}

@Component({
  selector: 'app-sql-snippet',
  template: '<button data-testid="run" (click)="run.emit(sql())"></button>'
})
class MockSqlSnippetComponent {
  readonly sql = input<string>('');
  readonly run = output<string>();
}

describe('ConversationComponent', () => { 
  let component: ConversationComponent; 
  let fixture: ComponentFixture<ConversationComponent>; 
  let mockStore: any; 
  let mockScratchpad: any; 
  let messagesSig: WritableSignal<MessageResponse[]>; 

  beforeEach(async () => { 
    messagesSig = signal([]); 
    mockStore = { 
      messages: messagesSig, 
      isGenerating: signal(false), 
      error: signal(null), 
      sendMessage: vi.fn(), 
      voteCandidate: vi.fn() 
    }; 
    mockScratchpad = { open: vi.fn() }; 

    await TestBed.configureTestingModule({ 
      imports: [ConversationComponent, NoopAnimationsModule], 
      schemas: [NO_ERRORS_SCHEMA],
      providers: [ 
        { provide: ChatStore, useValue: mockStore }, 
        { provide: AskDataService, useValue: mockScratchpad } 
      ] 
    })
      .overrideComponent(ConversationComponent, {
        remove: { imports: [VizMarkdownComponent, SqlSnippetComponent] },
        add: { imports: [MockVizMarkdownComponent, MockSqlSnippetComponent] }
      })
      .overrideComponent(ConversationComponent, {
        set: {
          template: readTemplate('./conversation.component.html'),
          templateUrl: null,
          schemas: [NO_ERRORS_SCHEMA]
        }
      })
      .compileComponents(); 

    fixture = TestBed.createComponent(ConversationComponent); 
    component = fixture.componentInstance; 
    fixture.detectChanges(); 
  }); 

  it('should render arena grid if candidates pending', () => { 
    const msg: MessageResponse = { 
      id: 'm1', conversation_id: 'c1', role: 'assistant', content: 'Wait', created_at: '', 
      candidates: [ 
        { id: '1', content: 'A', model_name: 'MA', is_selected: false }, 
        { id: '2', content: 'B', model_name: 'MB', is_selected: false } 
      ] 
    }; 
    messagesSig.set([msg]); 
    fixture.detectChanges(); 

    const grid = fixture.debugElement.query(By.css('.arena-grid')); 
    expect(grid).toBeTruthy(); 
    const cards = fixture.debugElement.queryAll(By.css('.candidate-card')); 
    expect(cards.length).toBe(2); 
  }); 

  it('should call vote on button click', () => { 
    const msg: MessageResponse = { 
      id: 'm1', conversation_id: 'c1', role: 'assistant', content: '', created_at: '', 
      candidates: [ { id: 'c1', content: 'A', model_name: 'MA', is_selected: false } ] 
    }; 
    messagesSig.set([msg]); 
    fixture.detectChanges(); 

    const btn = fixture.debugElement.query(By.css('button[color="primary"]')); 
    btn.triggerEventHandler('click', null); 

    expect(mockStore.voteCandidate).toHaveBeenCalledWith('m1', 'c1'); 
  }); 

  it('should send message and clear input', () => {
    component.inputText = 'Hello';
    component.send();
    expect(mockStore.sendMessage).toHaveBeenCalledWith('Hello');
    expect(component.inputText).toBe('');
  });

  it('should ignore empty send', () => {
    component.inputText = '   ';
    component.send();
    expect(mockStore.sendMessage).not.toHaveBeenCalled();
  });

  it('should handle enter key with shift', () => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    component.handleEnter(event);
    expect(preventSpy).not.toHaveBeenCalled();
  });

  it('should handle enter key without shift', () => {
    component.inputText = 'Hello';
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    component.handleEnter(event);
    expect(preventSpy).toHaveBeenCalled();
    expect(mockStore.sendMessage).toHaveBeenCalledWith('Hello');
  });

  it('should clean content by removing sql blocks', () => {
    const msg = { content: 'Hi```sql\nSELECT 1\n```Bye', sql_snippet: 'SELECT 1' } as any;
    expect(component.cleanContent(msg)).toBe('HiBye');
    expect(component.cleanContentSimple('A```sql\nB\n```C')).toBe('AC');
  });

  it('should return content unchanged when no sql snippet', () => {
    const msg = { content: 'Plain text' } as any;
    expect(component.cleanContent(msg)).toBe('Plain text');
  });

  it('should open scratchpad on runQuery', () => {
    component.runQuery('SELECT 1');
    expect(mockScratchpad.open).toHaveBeenCalled();
  });

  it('should detect pending candidates', () => {
    const msg = {
      role: 'assistant',
      candidates: [{ id: 'c', is_selected: false }]
    } as any;
    expect(component.hasPendingCandidates(msg)).toBe(true);

    msg.candidates[0].is_selected = true;
    expect(component.hasPendingCandidates(msg)).toBe(false);
  });

  it('should return false for non-assistant or empty candidates', () => {
    expect(component.hasPendingCandidates({ role: 'user' } as any)).toBe(false);
    expect(component.hasPendingCandidates({ role: 'assistant', candidates: [] } as any)).toBe(false);
    expect(component.hasPendingCandidates({ role: 'assistant' } as any)).toBe(false);
  });

  it('should safely handle scrollToBottom without container', () => {
    (component as any).scrollContainer = undefined;
    component['scrollToBottom']();
    expect(true).toBe(true);
  });

  it('should scroll to bottom when container exists', () => {
    vi.useFakeTimers();
    const native = { scrollTop: 0, scrollHeight: 120 };
    (component as any).scrollContainer = { nativeElement: native };

    component['scrollToBottom']();
    vi.runAllTimers();

    expect(native.scrollTop).toBe(120);
    vi.useRealTimers();
  });
  
  it('should skip scroll update if container removed before timer', () => {
    vi.useFakeTimers();
    const native = { scrollTop: 0, scrollHeight: 120 };
    (component as any).scrollContainer = { nativeElement: native };

    component['scrollToBottom']();
    (component as any).scrollContainer = undefined;
    vi.runAllTimers();

    expect(native.scrollTop).toBe(0);
    vi.useRealTimers();
  });

  it('should skip scroll if container removed before timer fires', () => {
    vi.useFakeTimers();
    const native = { scrollTop: 0, scrollHeight: 50 };
    (component as any).scrollContainer = { nativeElement: native };

    component['scrollToBottom']();
    (component as any).scrollContainer = undefined;
    vi.runAllTimers();

    expect(native.scrollTop).toBe(0);
    vi.useRealTimers();
  });

  it('should trigger scrollToBottom when messages arrive', () => {
    const spy = vi.spyOn(component as any, 'scrollToBottom');
    messagesSig.set([{ id: 'm1', conversation_id: 'c1', role: 'user', content: 'Hi' } as any]);
    TestBed.flushEffects();
    expect(spy).toHaveBeenCalled();
  });

  it('should send message from template button and textarea enter', () => {
    component.inputText = 'Hello';
    fixture.detectChanges();
    const sendBtn = fixture.debugElement.query(By.css('button[aria-label="Send Message"]'));
    sendBtn.triggerEventHandler('click', null);
    expect(mockStore.sendMessage).toHaveBeenCalledWith('Hello');

    component.inputText = 'Hi again';
    fixture.detectChanges();
    const textarea = fixture.debugElement.query(By.css('textarea'));
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    textarea.triggerEventHandler('keydown.enter', event);
    expect(mockStore.sendMessage).toHaveBeenCalledWith('Hi again');
  });

  it('should render empty, generating, and error states', () => {
    messagesSig.set([]);
    mockStore.isGenerating.set(false);
    mockStore.error.set(null);
    fixture.detectChanges();
    expect(fixture.debugElement.nativeElement.textContent).toContain('Start a new analysis conversation');

    mockStore.isGenerating.set(true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.animate-bounce'))).toBeTruthy();

    mockStore.error.set('Boom');
    fixture.detectChanges();
    expect(fixture.debugElement.nativeElement.textContent).toContain('Boom');
  });

  it('should handle sql snippet run output', () => {
    const msg: MessageResponse = {
      id: 'm1',
      conversation_id: 'c1',
      role: 'assistant',
      content: 'SQL',
      created_at: '',
      sql_snippet: 'SELECT 1'
    };
    messagesSig.set([msg]);
    fixture.detectChanges();
    const snippet = fixture.debugElement.query(By.directive(MockSqlSnippetComponent));
    snippet.triggerEventHandler('run', 'SELECT 1');
    expect(mockScratchpad.open).toHaveBeenCalled();
  });
});
