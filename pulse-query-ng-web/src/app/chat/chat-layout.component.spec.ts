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

  it('should load history on init', () => {
    expect(mockStore.loadHistory).toHaveBeenCalled();
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

  it('should not rename when prompt is empty or same', () => {
    const chatObj = { id: 'c1', title: 'C1', updated_at: '', messages: [] } as any;
    vi.spyOn(window, 'prompt').mockReturnValue('');
    component.renameChat(chatObj);
    expect(mockStore.renameConversation).not.toHaveBeenCalled();

    vi.spyOn(window, 'prompt').mockReturnValue('C1');
    component.renameChat(chatObj);
    expect(mockStore.renameConversation).not.toHaveBeenCalled();
  });

  it('should not delete when confirm is false', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const chatObj = { id: 'c1', title: 'C1', updated_at: '', messages: [] } as any;
    component.deleteChat(chatObj);
    expect(mockStore.deleteConversation).not.toHaveBeenCalled();
  });

  it('should group history into today and previous', () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    mockStore.conversations.set([
      { id: 't', title: 'Today', updated_at: now.toISOString() },
      { id: 'p', title: 'Prev', updated_at: yesterday.toISOString() }
    ]);
    fixture.detectChanges();

    const groups = component.groupedHistory();
    expect(groups.length).toBe(2);
    expect(groups[0].label).toBe('Today');
    expect(groups[1].label).toBe('Previous');
  });

  it('should group history only as today when no older entries', () => {
    const now = new Date();
    mockStore.conversations.set([
      { id: 't', title: 'Today', updated_at: now.toISOString() }
    ]);
    fixture.detectChanges();

    const groups = component.groupedHistory();
    expect(groups.length).toBe(1);
    expect(groups[0].label).toBe('Today');
  });

  it('should group history only as previous when no today entries', () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    mockStore.conversations.set([
      { id: 'p', title: 'Prev', updated_at: yesterday.toISOString() }
    ]);
    fixture.detectChanges();

    const groups = component.groupedHistory();
    expect(groups.length).toBe(1);
    expect(groups[0].label).toBe('Previous');
  });

  it('should handle null history gracefully', () => {
    mockStore.conversations.set(null as any);
    fixture.detectChanges();
    expect(component.groupedHistory().length).toBe(0);
  });

  it('should close drawer on select/new chat in over mode', () => {
    const close = vi.fn();
    component.drawer = { mode: 'over', close } as any;

    component.selectChat('c1');
    expect(mockStore.selectConversation).toHaveBeenCalledWith('c1');
    expect(close).toHaveBeenCalled();

    component.newChat();
    expect(mockStore.createNewChat).toHaveBeenCalled();
  });

  it('should not close drawer when not over mode', () => {
    const close = vi.fn();
    component.drawer = { mode: 'side', close } as any;

    component.selectChat('c1');
    expect(close).not.toHaveBeenCalled();
  });
}); 
