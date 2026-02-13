import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatLayoutComponent } from './chat-layout.component';
import { ChatStore } from './chat.store';
import { BreakpointObserver } from '@angular/cdk/layout';
import { BehaviorSubject } from 'rxjs';
import { signal, Component } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ConversationComponent } from './conversation/conversation.component';
import { By } from '@angular/platform-browser';
import { MatSidenav } from '@angular/material/sidenav';
import { MatMenuTrigger } from '@angular/material/menu';
import { OverlayContainer } from '@angular/cdk/overlay';
import { readTemplate } from '../../test-utils/component-resources';

@Component({ selector: 'app-conversation', template: '' })
class MockConv {}

describe('ChatLayoutComponent', () => {
  let component: ChatLayoutComponent,
    fixture: ComponentFixture<ChatLayoutComponent>,
    mockStore: any;
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

    handsetState$ = new BehaviorSubject<{ matches: boolean }>({ matches: false });

    await TestBed.configureTestingModule({
      imports: [ChatLayoutComponent, NoopAnimationsModule],
      providers: [
        { provide: BreakpointObserver, useValue: { observe: () => handsetState$.asObservable() } },
      ],
    })
      // FIX: Split overrides into separate calls.
      // Mixing `remove/add` (Component Imports) with `set` (Providers) in the same
      // overrideMetadata call is illegal in Angular Testing APIs.
      .overrideComponent(ChatLayoutComponent, {
        remove: { imports: [ConversationComponent] },
        add: { imports: [MockConv] },
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
      { id: 'p', title: 'Prev', updated_at: yesterday.toISOString() },
    ]);
    fixture.detectChanges();

    const groups = component.groupedHistory();
    expect(groups.length).toBe(2);
    expect(groups[0].label).toBe('Today');
    expect(groups[1].label).toBe('Previous');
  });

  it('should group history only as today when no older entries', () => {
    const now = new Date();
    mockStore.conversations.set([{ id: 't', title: 'Today', updated_at: now.toISOString() }]);
    fixture.detectChanges();

    const groups = component.groupedHistory();
    expect(groups.length).toBe(1);
    expect(groups[0].label).toBe('Today');
  });

  it('should group history only as previous when no today entries', () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    mockStore.conversations.set([{ id: 'p', title: 'Prev', updated_at: yesterday.toISOString() }]);
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

  it('should trigger new chat and select chat from template', () => {
    component.drawer = { mode: 'over', close: vi.fn() } as any;
    fixture.detectChanges();
    const newChatBtn = fixture.debugElement.query(By.css('button[mat-stroked-button]'));
    newChatBtn.triggerEventHandler('click', null);
    expect(mockStore.createNewChat).toHaveBeenCalled();

    const nav = fixture.debugElement.query(By.css('.nav-content'));
    nav.triggerEventHandler('click', null);
    expect(mockStore.selectConversation).toHaveBeenCalledWith('c1');
  });

  it('should render loading spinner when data loading', () => {
    mockStore.isDataLoading.set(true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('mat-spinner'))).toBeTruthy();
  });

  it('should show handset toolbar and toggle drawer', async () => {
    handsetState$.next({ matches: true });
    await fixture.whenStable();
    fixture.detectChanges();
    const toolbar = fixture.debugElement.query(By.css('mat-toolbar'));
    expect(toolbar).toBeTruthy();
    const toolbarBtn = toolbar.query(By.css('button'));
    expect(toolbarBtn).toBeTruthy();
    const sidenav = fixture.debugElement.query(By.directive(MatSidenav)).injector.get(MatSidenav);
    const toggleSpy = vi.spyOn(sidenav, 'toggle');
    toolbarBtn.triggerEventHandler('click', null);
    expect(toggleSpy).toHaveBeenCalled();
  });

  it('should wire menu actions and stop propagation', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Renamed');
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const menuBtn = fixture.debugElement.query(By.css('button[mat-icon-button].action-btn'));
    expect(menuBtn).toBeTruthy();
    const clickEvent = { stopPropagation: vi.fn() } as any;
    menuBtn.triggerEventHandler('click', clickEvent);
    expect(clickEvent.stopPropagation).toHaveBeenCalled();

    const trigger = menuBtn.injector.get(MatMenuTrigger);
    trigger.openMenu();
    fixture.detectChanges();

    const overlayEl = overlay.getContainerElement();
    const items = overlayEl.querySelectorAll('button[mat-menu-item], button.mat-mdc-menu-item');
    expect(items.length).toBeGreaterThan(1);
    (items[0] as HTMLElement).click();
    (items[1] as HTMLElement).click();

    expect(mockStore.renameConversation).toHaveBeenCalledWith('c1', 'Renamed');
    expect(mockStore.deleteConversation).toHaveBeenCalledWith('c1');
  });
});
