import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatLayoutComponent } from './chat-layout.component';
import { ChatStore } from './chat.store';
import { BreakpointObserver } from '@angular/cdk/layout';
import { BehaviorSubject, of } from 'rxjs';
import { signal, Component } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ConversationComponent } from './conversation/conversation.component';
import { By } from '@angular/platform-browser';
import { MatSidenav } from '@angular/material/sidenav';
import { MatMenuTrigger } from '@angular/material/menu';
import { OverlayContainer } from '@angular/cdk/overlay';
import { readTemplate } from '../../test-utils/component-resources';
import { QueryCartService } from '../global/query-cart.service';
import { QueryCartComponent } from '../dashboard/query-cart/query-cart.component';
import { MatDialog } from '@angular/material/dialog';
import { PromptDialogComponent } from '../shared/components/dialogs/prompt-dialog.component';
import { ConfirmDialogComponent } from '../shared/components/dialogs/confirm-dialog.component';

@Component({ selector: 'app-conversation', template: '' })
class MockConv {}

@Component({ selector: 'app-query-cart', template: '' })
class MockCart {}

describe('ChatLayoutComponent', () => {
  let component: ChatLayoutComponent,
    fixture: ComponentFixture<ChatLayoutComponent>,
    mockStore: any,
    mockCartService: any,
    mockDialog: any;
  let overlay: OverlayContainer;
  let handsetState$: BehaviorSubject<{ matches: boolean }>;

  beforeEach(async () => {
    mockStore = {
      conversations: signal([{ id: 'c1', title: 'C1', updated_at: new Date().toISOString() }]),
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
      imports: [ChatLayoutComponent, NoopAnimationsModule],
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
    overlay = TestBed.inject(OverlayContainer);
  });

  it('should load history on init', () => {
    expect(mockStore.loadHistory).toHaveBeenCalled();
  });

  it('should show tabs with cart count', () => {
    const tabs = fixture.debugElement.queryAll(By.css('.mat-mdc-tab'));
    expect(tabs.length).toBe(2);
    expect(tabs[1].nativeElement.textContent).toContain('5');
  });

  it('should trigger delete via dialog', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(true) });
    const chatObj = { id: 'c1', title: 'C1', updated_at: '', messages: [] } as any;

    component.deleteChat(chatObj);
    expect(mockDialog.open).toHaveBeenCalledWith(ConfirmDialogComponent, expect.anything());
    expect(mockStore.deleteConversation).toHaveBeenCalledWith('c1');
  });

  it('should trigger rename via dialog', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of('New Name') });
    const chatObj = { id: 'c1', title: 'C1', updated_at: '', messages: [] } as any;

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

  it('should group older chats in Previous', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 5);
    mockStore.conversations.set([{ id: 'c1', title: 'C1', updated_at: oldDate.toISOString() }]);
    const groups = component.groupedHistory();
    expect(groups.length).toBe(1);
    expect(groups[0].label).toBe('Previous');
  });

  it('should return empty group if list is null', () => {
    mockStore.conversations.set(null);
    expect(component.groupedHistory()).toEqual([]);
  });

  it('should ignore rename if same or cancelled', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of('C1') });
    component.renameChat({ id: 'c1', title: 'C1', updated_at: '' } as any);
    expect(mockStore.renameConversation).not.toHaveBeenCalled();

    mockDialog.open.mockReturnValue({ afterClosed: () => of(null) });
    component.renameChat({ id: 'c1', title: '', updated_at: '' } as any); // test chat.title || '' fallback
    expect(mockStore.renameConversation).not.toHaveBeenCalled();
  });

  it('should not delete if dialog cancelled', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(false) });
    component.deleteChat({ id: 'c1', title: 'C1', updated_at: '' } as any);
    expect(mockStore.deleteConversation).not.toHaveBeenCalled();
  });

  it('should select chat and close drawer if over', () => {
    component.drawer = { mode: 'over', close: vi.fn() } as any;
    component.selectChat('c2');
    expect(mockStore.selectConversation).toHaveBeenCalledWith('c2');
    expect(component.drawer.close).toHaveBeenCalled();

    // test mode !== 'over'
    component.drawer = { mode: 'side', close: vi.fn() } as any;
    component.selectChat('c2');
    expect(component.drawer.close).not.toHaveBeenCalled();
  });

  it('should new chat and close drawer if over', () => {
    component.drawer = { mode: 'over', close: vi.fn() } as any;
    component.newChat();
    expect(mockStore.createNewChat).toHaveBeenCalled();
    expect(component.drawer.close).toHaveBeenCalled();
  });
});
