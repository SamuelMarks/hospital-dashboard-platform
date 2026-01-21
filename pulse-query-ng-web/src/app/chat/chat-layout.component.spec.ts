/**
 * @fileoverview Unit tests for ChatLayoutComponent.
 * Verifies sidebar interactions, responsive behavior signals, and grouping logic.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatLayoutComponent } from './chat-layout.component';
import { ChatStore } from './chat.store';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of, BehaviorSubject } from 'rxjs';
import { signal, WritableSignal, Component } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { ConversationResponse } from '../api-client';
import { ConversationComponent } from './conversation/conversation.component';

// Mock Conversation Child
@Component({ selector: 'app-conversation', template: '' })
class MockConversationComponent {}

describe('ChatLayoutComponent', () => {
  let component: ChatLayoutComponent;
  let fixture: ComponentFixture<ChatLayoutComponent>;

  let mockStore: any;
  let mockBreakpointObserver: any;
  let breakpointSubject: BehaviorSubject<{ matches: boolean }>;

  // Signals
  let conversationsSig: WritableSignal<ConversationResponse[]>;
  let activeIdSig: WritableSignal<string | null>;
  let isLoadingSig: WritableSignal<boolean>;

  beforeEach(async () => {
    conversationsSig = signal([]);
    activeIdSig = signal(null);
    isLoadingSig = signal(false);

    mockStore = {
      conversations: conversationsSig,
      activeConversationId: activeIdSig,
      isDataLoading: isLoadingSig,
      loadHistory: vi.fn(),
      selectConversation: vi.fn(),
      createNewChat: vi.fn()
    };

    breakpointSubject = new BehaviorSubject<{ matches: boolean }>({ matches: false });
    mockBreakpointObserver = {
      observe: vi.fn().mockReturnValue(breakpointSubject.asObservable())
    };

    await TestBed.configureTestingModule({
      imports: [ChatLayoutComponent, NoopAnimationsModule],
      providers: [
        { provide: BreakpointObserver, useValue: mockBreakpointObserver }
      ]
    })
    // FIX: Split overrides to avoid "Cannot set and add/remove DecoratorFactory" error
    .overrideComponent(ChatLayoutComponent, {
      remove: { imports: [ConversationComponent] },
      add: { imports: [MockConversationComponent] }
    })
    .overrideComponent(ChatLayoutComponent, {
      set: { providers: [{ provide: ChatStore, useValue: mockStore }] }
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(mockStore.loadHistory).toHaveBeenCalled();
  });

  it('should render conversation list via groups', () => {
    const today = new Date().toISOString();
    const mockData: ConversationResponse[] = [
      { id: '1', title: 'Chat A', updated_at: today } as any,
      { id: '2', title: 'Chat B', updated_at: '2000-01-01' } as any
    ];
    conversationsSig.set(mockData);
    fixture.detectChanges();

    const groups = component.groupedHistory();
    expect(groups.length).toBe(2); // Today, Older
    expect(groups[0].label).toBe('Today');
    expect(groups[1].label).toBe('Previous 30 Days'); // Or similar

    const items = fixture.debugElement.queryAll(By.css('.nav-item'));
    expect(items.length).toBe(2);
  });

  it('should highlight active conversation', () => {
    conversationsSig.set([{ id: '1', title: 'Active', updated_at: new Date().toISOString() }] as any);
    activeIdSig.set('1');
    fixture.detectChanges();

    const item = fixture.debugElement.query(By.css('.nav-item'));
    expect(item.classes['active']).toBe(true);
  });

  it('should trigger store selection on click', () => {
    conversationsSig.set([{ id: '1', title: 'Click Me', updated_at: new Date().toISOString() }] as any);
    fixture.detectChanges();

    const item = fixture.debugElement.query(By.css('.nav-item'));
    item.triggerEventHandler('click', null);

    expect(mockStore.selectConversation).toHaveBeenCalledWith('1');
  });

  it('should collapse drawer on mobile selection', () => {
    // Simulate Mobile
    breakpointSubject.next({ matches: true });
    fixture.detectChanges();

    // Mock drawer toggle methods
    component.drawer.close = vi.fn();

    component.selectChat('1');
    expect(component.drawer.close).toHaveBeenCalled();
  });

  it('should trigger new chat', () => {
    component.newChat();
    expect(mockStore.createNewChat).toHaveBeenCalled();
  });
});