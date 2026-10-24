/**
 * @fileoverview Unit tests for ChatLayoutComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatLayoutComponent } from './chat-layout.component';
import { ChatStore } from './chat.store';
import { BreakpointObserver } from '@angular/cdk/layout';
import { BehaviorSubject, of } from 'rxjs';
import { signal, Component, WritableSignal } from '@angular/core';
import { ConversationComponent } from './conversation/conversation.component';
import { By } from '@angular/platform-browser';
import { readTemplate } from '../../test-utils/component-resources';
import { createMockConversation } from '../../test-utils/mock-factories';
import { ConversationResponse } from '../api-client';
import { QueryCartService } from '../global/query-cart.service';
import { QueryCartComponent } from '../dashboard/query-cart/query-cart.component';
import { MatDialog } from '@angular/material/dialog';
import { PromptDialogComponent } from '../shared/components/dialogs/prompt-dialog.component';
import { ConfirmDialogComponent } from '../shared/components/dialogs/confirm-dialog.component';

/** Mock conversation component for unit testing. */
@Component({
  selector: 'app-conversation',
  template: '',
})
class MockConv {}

/** Mock query cart component for unit testing. */
@Component({
  selector: 'app-query-cart',
  template: '',
})
class MockCart {}

describe('ChatLayoutComponent', () => {
  let component: ChatLayoutComponent,
    fixture: ComponentFixture<ChatLayoutComponent>,
    mockStore: {
      conversations: WritableSignal<ConversationResponse[] | null>;
      activeConversationId: WritableSignal<string | null>;
      isDataLoading: WritableSignal<boolean>;
      loadHistory: ReturnType<typeof vi.fn>;
      selectConversation: ReturnType<typeof vi.fn>;
      createNewChat: ReturnType<typeof vi.fn>;
      deleteConversation: ReturnType<typeof vi.fn>;
      renameConversation: ReturnType<typeof vi.fn>;
    },
    mockCartService: { count: WritableSignal<number> },
    mockDialog: { open: ReturnType<typeof vi.fn> };
  let handsetState$: BehaviorSubject<{ matches: boolean }>;

  beforeEach(async () => {
    mockStore = {
      conversations: signal<ConversationResponse[] | null>([
        createMockConversation({
          id: 'c1',
          title: 'C1',
          updated_at: new Date('2024-01-01T00:00:00Z').toISOString(),
        }),
      ]),
      activeConversationId: signal(null),
      isDataLoading: signal(false),
      loadHistory: vi.fn(),
      selectConversation: vi.fn(),
      createNewChat: vi.fn(),
      deleteConversation: vi.fn(),
      renameConversation: vi.fn(),
    };
    mockCartService = { count: signal(5) };
    mockDialog = { open: vi.fn() };

    handsetState$ = new BehaviorSubject<{ matches: boolean }>({ matches: false });

    await TestBed.configureTestingModule({
      imports: [ChatLayoutComponent],
      providers: [
        { provide: BreakpointObserver, useValue: { observe: () => handsetState$.asObservable() } },
        { provide: QueryCartService, useValue: mockCartService },
        { provide: MatDialog, useValue: mockDialog },
      ],
    })
      .overrideComponent(ChatLayoutComponent, {
        remove: { imports: [ConversationComponent, QueryCartComponent] },
        add: { imports: [MockConv, MockCart] },
      })
      .overrideComponent(ChatLayoutComponent, {
        set: { providers: [{ provide: ChatStore, useValue: mockStore }] },
      })
      .overrideComponent(ChatLayoutComponent, {
        set: { template: readTemplate('./chat-layout.component.html'), templateUrl: undefined },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should load history on init', () => {
    expect(mockStore.loadHistory).toHaveBeenCalled();
  });

  it('should show tabs with cart count', () => {
    const tabs = fixture.debugElement.queryAll(By.css('.mat-mdc-tab'));
    expect(tabs.length).toBe(2);
    expect((tabs[1]?.nativeElement as HTMLElement | undefined)?.textContent).toContain('5');
  });

  it('should trigger delete via dialog', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(true) });
    const chatObj = createMockConversation({ id: 'c1', title: 'C1', updated_at: '' });

    component.deleteChat(chatObj);
    expect(mockDialog.open).toHaveBeenCalledWith(ConfirmDialogComponent, expect.anything());
    expect(mockStore.deleteConversation).toHaveBeenCalledWith('c1');
  });

  it('should trigger rename via dialog', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of('New Name') });
    const chatObj = createMockConversation({ id: 'c1', title: 'C1', updated_at: '' });

    component.renameChat(chatObj);
    expect(mockDialog.open).toHaveBeenCalledWith(PromptDialogComponent, expect.anything());
    expect(mockStore.renameConversation).toHaveBeenCalledWith('c1', 'New Name');
  });

  it('should toggle sidebar', () => {
    const initial = component.sidebarOpen();
    component.toggleSidebar();
    expect(component.sidebarOpen()).toBe(!initial);
  });

  it('should handle handset mode toolbar', async () => {
    handsetState$.next({ matches: true });
    await fixture.whenStable();
    fixture.detectChanges();
    const toolbar = fixture.debugElement.query(By.css('mat-toolbar'));
    expect(toolbar).toBeTruthy();
  });

  it('should group today chats in Today and older chats in Previous', () => {
    const todayDate = new Date();
    const oldDate = new Date('2024-01-01T00:00:00Z');
    oldDate.setDate(oldDate.getDate() - 5);
    mockStore.conversations.set([
      createMockConversation({ id: 'c0', title: 'C0', updated_at: todayDate.toISOString() }),
      createMockConversation({ id: 'c1', title: 'C1', updated_at: oldDate.toISOString() }),
    ]);
    const groups = component.groupedHistory();
    expect(groups.length).toBe(2);
    expect(groups[0]?.label).toBe('Today');
    expect(groups[1]?.label).toBe('Previous');
  });

  it('should return empty group if list is null', () => {
    mockStore.conversations.set(null);
    expect(component.groupedHistory()).toEqual([]);
  });

  it('should ignore rename if same or cancelled', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of('C1') });
    component.renameChat(createMockConversation({ id: 'c1', title: 'C1', updated_at: '' }));
    expect(mockStore.renameConversation).not.toHaveBeenCalled();

    mockDialog.open.mockReturnValue({ afterClosed: () => of(null) });
    component.renameChat(createMockConversation({ id: 'c1', title: '', updated_at: '' }));
    expect(mockStore.renameConversation).not.toHaveBeenCalled();
  });

  it('should not delete if dialog cancelled', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(false) });
    component.deleteChat(createMockConversation({ id: 'c1', title: 'C1', updated_at: '' }));
    expect(mockStore.deleteConversation).not.toHaveBeenCalled();
  });

  it('should select chat and close drawer if over', () => {
    const closeOver = vi.fn();
    vi.spyOn(component, 'drawer').mockReturnValue({
      mode: 'over',
      close: closeOver,
    });
    component.selectChat('c2');
    expect(mockStore.selectConversation).toHaveBeenCalledWith('c2');
    expect(closeOver).toHaveBeenCalled();

    const closeSide = vi.fn();
    vi.spyOn(component, 'drawer').mockReturnValue({
      mode: 'side',
      close: closeSide,
    });
    component.selectChat('c2');
    expect(closeSide).not.toHaveBeenCalled();
  });

  it('should new chat and close drawer if over', () => {
    const closeOver = vi.fn();
    vi.spyOn(component, 'drawer').mockReturnValue({
      mode: 'over',
      close: closeOver,
    });
    component.newChat();
    expect(mockStore.createNewChat).toHaveBeenCalled();
    expect(closeOver).toHaveBeenCalled();
  });
});
