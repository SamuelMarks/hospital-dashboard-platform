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
      providers: [ 
        { provide: ChatStore, useValue: mockStore }, 
        { provide: AskDataService, useValue: mockScratchpad } 
      ] 
    }).compileComponents(); 

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
});