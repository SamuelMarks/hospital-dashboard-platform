import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { ChatLayoutComponent } from './chat-layout.component'; 
import { ChatStore } from './chat.store'; 
import { BreakpointObserver } from '@angular/cdk/layout'; 
import { of } from 'rxjs'; 
import { signal, Component } from '@angular/core'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { ConversationComponent } from './conversation/conversation.component'; 

@Component({ selector: 'app-conversation', template: '' }) class MockConv {} 

describe('ChatLayoutComponent', () => { 
  let component: ChatLayoutComponent, fixture: ComponentFixture<ChatLayoutComponent>, mockStore: any; 

  beforeEach(async () => { 
    mockStore = { 
      conversations: signal([{id: 'c1', title: 'C1', updated_at: new Date().toISOString()}]), 
      activeConversationId: signal(null), 
      isDataLoading: signal(false), 
      loadHistory: vi.fn(), 
      selectConversation: vi.fn(), 
      createNewChat: vi.fn(), 
      deleteConversation: vi.fn(), 
      renameConversation: vi.fn() 
    }; 
    
    await TestBed.configureTestingModule({ 
      imports: [ChatLayoutComponent, NoopAnimationsModule], 
      providers: [{ provide: BreakpointObserver, useValue: { observe: () => of({matches:false}) } }] 
    }) 
    // FIX: Split overrides into separate calls. 
    // Mixing `remove/add` (Component Imports) with `set` (Providers) in the same 
    // overrideMetadata call is illegal in Angular Testing APIs. 
    .overrideComponent(ChatLayoutComponent, { 
      remove: { imports: [ConversationComponent] }, 
      add: { imports: [MockConv] } 
    }) 
    .overrideComponent(ChatLayoutComponent, { 
      set: { providers: [{ provide: ChatStore, useValue: mockStore }] } 
    }) 
    .compileComponents(); 

    fixture = TestBed.createComponent(ChatLayoutComponent); 
    component = fixture.componentInstance; 
    fixture.detectChanges(); 
  }); 

  it('should trigger delete', () => { 
    vi.spyOn(window, 'confirm').mockReturnValue(true); 
    const chatObj = { id: 'c1', title: 'C1', updated_at: '', messages: [] } as any; 
    
    component.deleteChat(chatObj); 
    expect(mockStore.deleteConversation).toHaveBeenCalledWith('c1'); 
  }); 

  it('should trigger rename', () => { 
    vi.spyOn(window, 'prompt').mockReturnValue('New Name'); 
    const chatObj = { id: 'c1', title: 'C1', updated_at: '', messages: [] } as any; 
    
    component.renameChat(chatObj); 
    expect(mockStore.renameConversation).toHaveBeenCalledWith('c1', 'New Name'); 
  }); 
});