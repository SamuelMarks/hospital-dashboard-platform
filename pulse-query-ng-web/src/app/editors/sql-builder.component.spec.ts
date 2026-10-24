/**
 * @fileoverview Unit tests for SqlBuilderComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SqlBuilderComponent } from './sql-builder.component';
import {
  DashboardsService,
  ExecutionService,
  SchemaService,
  BASE_PATH,
  ChatService,
} from '../api-client';
import { DashboardStore } from '../dashboard/dashboard.store';
import { signal, WritableSignal, NO_ERRORS_SCHEMA, Component, input } from '@angular/core';
import { HttpErrorResponse, withXhr, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { EditorState } from '@codemirror/state';
import { By } from '@angular/platform-browser';
import { MatMenuTrigger } from '@angular/material/menu';
import { OverlayContainer } from '@angular/cdk/overlay';
import { readTemplate } from '../../test-utils/component-resources';
import { VizTableComponent } from '../shared/visualizations/viz-table/viz-table.component';
import { ConversationComponent } from '../chat/conversation/conversation.component';
import { vi } from 'vitest';

/** Mock table visualization component for unit testing `SqlBuilderComponent`. */
@Component({
  selector: 'viz-table',
  template: '<div data-testid="mock-table"></div>',
})
class MockVizTableComponent {
  /** Dataset input binding. */
  readonly dataSet = input<unknown>();
}

/** Mock conversation component for unit testing `SqlBuilderComponent`. */
@Component({
  selector: 'app-conversation',
  template: '<div data-testid="mock-conversation"></div>',
})
class MockConversationComponent {}

describe('SqlBuilderComponent', () => {
  let component: SqlBuilderComponent;
  let fixture: ComponentFixture<SqlBuilderComponent>;

  let mockDashApi: {
    updateWidgetApiV1DashboardsWidgetsWidgetIdPut: ReturnType<typeof vi.fn>;
  };
  let mockExecApi: {
    refreshDashboardApiV1DashboardsDashboardIdRefreshPost: ReturnType<typeof vi.fn>;
  };
  let mockSchemaApi: {
    getDatabaseSchemaApiV1SchemaGet: ReturnType<typeof vi.fn>;
  };
  let mockChatApi: {
    listConversationsApiV1ConversationsGet: ReturnType<typeof vi.fn>;
    getMessagesApiV1ConversationsConversationIdMessagesGet: ReturnType<typeof vi.fn>;
    createConversationApiV1ConversationsPost: ReturnType<typeof vi.fn>;
    sendMessageApiV1ConversationsConversationIdMessagesPost: ReturnType<typeof vi.fn>;
    voteMessageApiV1ConversationsConversationIdMessagesMessageIdVotePost: ReturnType<typeof vi.fn>;
    deleteConversationApiV1ConversationsConversationIdDelete: ReturnType<typeof vi.fn>;
    updateConversationApiV1ConversationsConversationIdPut: ReturnType<typeof vi.fn>;
  };
  let mockStore: {
    globalParams: WritableSignal<Record<string, unknown>>;
  };

  beforeEach(async () => {
    mockDashApi = { updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn() };
    mockExecApi = { refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi.fn() };
    mockSchemaApi = { getDatabaseSchemaApiV1SchemaGet: vi.fn().mockReturnValue(of([])) };
    mockChatApi = {
      listConversationsApiV1ConversationsGet: vi.fn().mockReturnValue(of([])),
      getMessagesApiV1ConversationsConversationIdMessagesGet: vi.fn().mockReturnValue(of([])),
      createConversationApiV1ConversationsPost: vi
        .fn()
        .mockReturnValue(of({ id: 'c1', messages: [] })),
      sendMessageApiV1ConversationsConversationIdMessagesPost: vi.fn().mockReturnValue(of({})),
      voteMessageApiV1ConversationsConversationIdMessagesMessageIdVotePost: vi
        .fn()
        .mockReturnValue(of({})),
      deleteConversationApiV1ConversationsConversationIdDelete: vi.fn().mockReturnValue(of({})),
      updateConversationApiV1ConversationsConversationIdPut: vi.fn().mockReturnValue(of({})),
    };

    mockStore = {
      globalParams: signal<Record<string, unknown>>({ dept: 'Cardiology' }),
    };

    TestBed.overrideComponent(SqlBuilderComponent, {
      remove: { imports: [VizTableComponent, ConversationComponent] },
      add: { imports: [MockVizTableComponent, MockConversationComponent] },
    });
    TestBed.overrideComponent(SqlBuilderComponent, {
      set: {
        template: readTemplate('./sql-builder.component.html'),
        templateUrl: undefined,
        schemas: [NO_ERRORS_SCHEMA],
      },
    });

    await TestBed.configureTestingModule({
      imports: [SqlBuilderComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: ExecutionService, useValue: mockExecApi },
        { provide: SchemaService, useValue: mockSchemaApi },
        { provide: ChatService, useValue: mockChatApi },
        { provide: DashboardStore, useValue: mockStore },
        { provide: BASE_PATH, useValue: 'http://api' },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SqlBuilderComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('dashboardId', 'd1');
    fixture.componentRef.setInput('widgetId', 'w1');
    fixture.componentRef.setInput('initialSql', "SELECT * FROM t WHERE d='{{dept}}'");
    fixture.detectChanges();
  });

  it('should fetch schema on view init for autocomplete', () => {
    expect(mockSchemaApi.getDatabaseSchemaApiV1SchemaGet).toHaveBeenCalled();
  });

  it('should inject parameters into SQL before run', () => {
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(
      of({ w1: { data: [] } }),
    );

    component.runQuery();

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({
        config: { query: "SELECT * FROM t WHERE d='Cardiology'" },
      }),
    );
  });

  it('should display available parameters in menu', () => {
    expect(component.availableParams()).toContain('dept');
  });

  it('should fallback update signal if editor not ready on insert', () => {
    component.currentSql.set('SELECT ');
    component.editorView?.destroy();
    component.editorView = null;

    component.insertParam('dept');
    expect(component.currentSql()).toBe('SELECT  {{dept}}');
  });

  it('should set initial tab index from input', () => {
    const newFixture = TestBed.createComponent(SqlBuilderComponent);
    const inst = newFixture.componentInstance;
    newFixture.componentRef.setInput('dashboardId', 'd1');
    newFixture.componentRef.setInput('widgetId', 'w1');
    newFixture.componentRef.setInput('initialTab', 1);
    newFixture.detectChanges();
    expect(inst.selectedTabIndex()).toBe(1);
  });

  it('should insert param using editorView when available', () => {
    const dispatch = vi.fn();
    const focus = vi.fn();
    const destroy = vi.fn();
    component.editorView?.destroy();
    component.editorView = {
      state: EditorState.create({ doc: 'SELECT ' }),
      dispatch,
      focus,
      destroy,
    };

    component.insertParam('dept');
    expect(dispatch).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
  });

  it('should handle update errors in runQuery', () => {
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
      throwError(() => ({ error: { detail: 'Bad SQL' } })),
    );
    component.runQuery();
    expect(component.validationError()).toBe('Bad SQL');
    expect(component.isRunning()).toBe(false);
  });

  it('should set validationError if execution returns error payload', () => {
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(
      of({ w1: { error: 'Catalog Error: Table not found' } }),
    );

    component.runQuery();

    expect(component.validationError()).toBe('Catalog Error: Table not found');
    expect(component.latestResult()).toBeNull();
  });

  it('should handle execution network errors after update', () => {
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(
      throwError(() => new Error('exec fail')),
    );
    component.runQuery();
    expect(component.isRunning()).toBe(false);
    expect(component.validationError()).toBe('Network execution failed.');
  });

  it('should handle schema load errors and no editor', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    component.editorView?.destroy();
    component.editorView = null;

    mockSchemaApi.getDatabaseSchemaApiV1SchemaGet.mockReturnValue(
      of([{ table_name: 't', columns: [{ name: 'c' }] }]),
    );
    component.loadSchemaForAutocomplete();

    mockSchemaApi.getDatabaseSchemaApiV1SchemaGet.mockReturnValue(
      throwError(() => new Error('fail')),
    );
    component.loadSchemaForAutocomplete();

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to load schema for autocomplete',
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });

  it('should dispatch schema config when editor exists', () => {
    const dispatch = vi.fn();
    const destroy = vi.fn();
    component.editorView?.destroy();
    component.editorView = {
      state: EditorState.create({ doc: '' }),
      dispatch,
      focus: vi.fn(),
      destroy,
    };
    mockSchemaApi.getDatabaseSchemaApiV1SchemaGet.mockReturnValue(
      of([{ table_name: 't', columns: [{ name: 'c' }] }]),
    );
    component.loadSchemaForAutocomplete();
    expect(dispatch).toHaveBeenCalled();
  });

  it('should destroy editor on ngOnDestroy', () => {
    const destroy = vi.fn();
    component.editorView?.destroy();
    component.editorView = {
      state: EditorState.create({ doc: '' }),
      dispatch: vi.fn(),
      focus: vi.fn(),
      destroy,
    };
    component.ngOnDestroy();
    expect(destroy).toHaveBeenCalled();
  });

  it('should no-op initEditor without host', () => {
    const prev = component.editorView;
    vi.spyOn(component, 'editorHost').mockReturnValue(undefined);
    component.initEditor();
    expect(component.editorView).toBe(prev);
  });

  it('should initialize editor when host is available', () => {
    const host = document.createElement('div');
    vi.spyOn(component, 'editorHost').mockReturnValue({ nativeElement: host });
    const createSpy = vi.spyOn(EditorState, 'create');
    component.initEditor();
    expect(component.editorView).toBeTruthy();
    expect(createSpy).toHaveBeenCalled();

    const view = component.editorView;
    if (view) {
      view.dispatch({ changes: { from: 0, to: 0, insert: 'X' } });
      view.dispatch({ selection: { anchor: 0 } });
    }
    expect(component.currentSql().startsWith('X')).toBe(true);

    createSpy.mockRestore();
    component.editorView?.destroy();
  });

  it('should fall back to default error message when detail missing', () => {
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Error' })),
    );

    component.runQuery();

    expect(component.validationError()).toBe('Failed to save query.');
    expect(component.isRunning()).toBe(false);
  });

  it('should emit saveToCart when SQL is present', () => {
    const emitSpy = vi.fn();
    component.saveToCart.subscribe(emitSpy);
    component.currentSql.set('SELECT 1');

    component.saveQueryToCart();

    expect(emitSpy).toHaveBeenCalledWith('SELECT 1');
  });

  it('should not emit saveToCart when SQL is empty', () => {
    const emitSpy = vi.fn();
    component.saveToCart.subscribe(emitSpy);
    component.currentSql.set('   ');

    component.saveQueryToCart();

    expect(emitSpy).not.toHaveBeenCalled();
  });
});

describe('SqlBuilderComponent template wiring', () => {
  let fixture: ComponentFixture<SqlBuilderComponent>;
  let component: SqlBuilderComponent;
  let mockDashApi: {
    updateWidgetApiV1DashboardsWidgetsWidgetIdPut: ReturnType<typeof vi.fn>;
  };
  let mockExecApi: {
    refreshDashboardApiV1DashboardsDashboardIdRefreshPost: ReturnType<typeof vi.fn>;
  };
  let mockSchemaApi: {
    getDatabaseSchemaApiV1SchemaGet: ReturnType<typeof vi.fn>;
  };
  let mockStore: {
    globalParams: WritableSignal<Record<string, unknown>>;
  };
  let overlay: OverlayContainer;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    mockDashApi = {
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn().mockReturnValue(of({})),
    };
    mockExecApi = {
      refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi
        .fn()
        .mockReturnValue(of({ w1: { columns: [], data: [] } })),
    };
    mockSchemaApi = { getDatabaseSchemaApiV1SchemaGet: vi.fn().mockReturnValue(of([])) };
    mockStore = { globalParams: signal<Record<string, unknown>>({}) };

    await TestBed.configureTestingModule({
      imports: [SqlBuilderComponent],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: ExecutionService, useValue: mockExecApi },
        { provide: SchemaService, useValue: mockSchemaApi },
        { provide: ChatService, useValue: {} },
        { provide: DashboardStore, useValue: mockStore },
        { provide: BASE_PATH, useValue: 'http://api' },
      ],
    })
      .overrideComponent(SqlBuilderComponent, {
        remove: { imports: [VizTableComponent, ConversationComponent] },
        add: { imports: [MockVizTableComponent, MockConversationComponent] },
      })
      .overrideComponent(SqlBuilderComponent, {
        set: {
          template: readTemplate('./sql-builder.component.html'),
          templateUrl: undefined,
          schemas: [NO_ERRORS_SCHEMA],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(SqlBuilderComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('dashboardId', 'd1');
    fixture.componentRef.setInput('widgetId', 'w1');
    fixture.componentRef.setInput('enableCart', true);
    fixture.detectChanges();
    overlay = TestBed.inject(OverlayContainer);
  });

  it('should dismiss validation error from template button', () => {
    component.validationError.set('Bad SQL');
    fixture.detectChanges();
    const closeBtn = fixture.debugElement.query(By.css('[data-testid="error-banner"] button'));
    closeBtn.triggerEventHandler('click', null);
    expect(component.validationError()).toBeNull();
  });

  it('should open params menu and insert param', () => {
    mockStore.globalParams.set({ dept: 'Cardiology' });
    fixture.detectChanges();
    const trigger = fixture.debugElement
      .query(By.directive(MatMenuTrigger))
      .injector.get(MatMenuTrigger);
    const spy = vi.spyOn(component, 'insertParam');
    trigger.openMenu();
    fixture.detectChanges();
    const overlayEl = overlay.getContainerElement();
    const item = overlayEl.querySelector('button[mat-menu-item]') as HTMLElement;
    item.click();
    expect(spy).toHaveBeenCalledWith('dept');
  });

  it('should show empty params message when none available', () => {
    mockStore.globalParams.set({});
    fixture.detectChanges();
    const trigger = fixture.debugElement
      .query(By.directive(MatMenuTrigger))
      .injector.get(MatMenuTrigger);
    trigger.openMenu();
    fixture.detectChanges();
    const overlayEl = overlay.getContainerElement();
    expect(overlayEl.textContent).toContain('No global params set');
  });

  it('should wire save to cart and run query buttons', () => {
    const saveSpy = vi.spyOn(component, 'saveQueryToCart');
    const runSpy = vi.spyOn(component, 'runQuery').mockImplementation(() => {});
    component.currentSql.set('SELECT 1');
    fixture.detectChanges();
    const buttons = fixture.debugElement.queryAll(By.css('button'));
    const saveBtn = buttons.find((b) =>
      (b.nativeElement as HTMLElement).textContent?.includes('Save to Cart'),
    );
    const runBtn = buttons.find((b) =>
      (b.nativeElement as HTMLElement).textContent?.includes('Run Query'),
    );
    saveBtn?.triggerEventHandler('click', null);
    runBtn?.triggerEventHandler('click', null);
    expect(saveSpy).toHaveBeenCalled();
    expect(runSpy).toHaveBeenCalled();
  });

  it('should render result states in template', () => {
    component.latestResult.set({ columns: ['a'], data: [{ a: 1 }] });
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(MockVizTableComponent))).toBeTruthy();

    component.latestResult.set(null);
    component.isRunning.set(true);
    fixture.detectChanges();
    expect((fixture.debugElement.nativeElement as HTMLElement).textContent).toContain('Executing');

    component.isRunning.set(false);
    fixture.detectChanges();
    expect((fixture.debugElement.nativeElement as HTMLElement).textContent).toContain(
      'Run query to see results',
    );
  });
});
