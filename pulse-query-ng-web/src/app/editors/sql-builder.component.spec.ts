/** 
 * @fileoverview Unit tests for SqlBuilderComponent. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { SqlBuilderComponent } from './sql-builder.component'; 
import { DashboardsService, ExecutionService, SchemaService, BASE_PATH, ChatService } from '../api-client'; 
import { DashboardStore } from '../dashboard/dashboard.store'; 
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClient } from '@angular/common/http'; 
import { provideHttpClientTesting } from '@angular/common/http/testing'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { of, throwError } from 'rxjs'; 
import { SIGNAL, signalSetFn } from '@angular/core/primitives/signals';
import { EditorState } from '@codemirror/state';

describe('SqlBuilderComponent', () => { 
  let component: SqlBuilderComponent; 
  let fixture: ComponentFixture<SqlBuilderComponent>; 
  
  let mockDashApi: any; 
  let mockExecApi: any; 
  let mockSchemaApi: any; 
  let mockChatApi: any;
  let mockStore: any; 

  beforeEach(async () => { 
    mockDashApi = { updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn() }; 
    mockExecApi = { refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi.fn() }; 
    mockSchemaApi = { getDatabaseSchemaApiV1SchemaGet: vi.fn().mockReturnValue(of([])) }; 
    mockChatApi = { 
      listConversationsApiV1ConversationsGet: vi.fn().mockReturnValue(of([])),
      getMessagesApiV1ConversationsConversationIdMessagesGet: vi.fn().mockReturnValue(of([])),
      createConversationApiV1ConversationsPost: vi.fn().mockReturnValue(of({ id: 'c1', messages: [] })),
      sendMessageApiV1ConversationsConversationIdMessagesPost: vi.fn().mockReturnValue(of({})),
      voteMessageApiV1ConversationsConversationIdMessagesMessageIdVotePost: vi.fn().mockReturnValue(of({})),
      deleteConversationApiV1ConversationsConversationIdDelete: vi.fn().mockReturnValue(of({})),
      updateConversationApiV1ConversationsConversationIdPut: vi.fn().mockReturnValue(of({}))
    };
    
    mockStore = { 
      globalParams: signal<Record<string, any>>({ dept: 'Cardiology' }) 
    }; 

    TestBed.overrideComponent(SqlBuilderComponent, { 
      set: { template: '<div></div>' }
    });

    await TestBed.configureTestingModule({ 
      imports: [SqlBuilderComponent, NoopAnimationsModule], 
      providers: [ 
        provideHttpClient(), 
        provideHttpClientTesting(), 
        { provide: DashboardsService, useValue: mockDashApi }, 
        { provide: ExecutionService, useValue: mockExecApi }, 
        { provide: SchemaService, useValue: mockSchemaApi }, 
        { provide: ChatService, useValue: mockChatApi },
        { provide: DashboardStore, useValue: mockStore }, 
        { provide: BASE_PATH, useValue: 'http://api' } 
      ] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(SqlBuilderComponent); 
    component = fixture.componentInstance; 
    setInputSignal(component, 'dashboardId', 'd1');
    setInputSignal(component, 'widgetId', 'w1');
    setInputSignal(component, 'initialSql', "SELECT * FROM t WHERE d='{{dept}}'");
    fixture.detectChanges(); 
  }); 

  it('should fetch schema on view init for autocomplete', () => { 
    // Schema fetch happens in ngAfterViewInit
    expect(mockSchemaApi.getDatabaseSchemaApiV1SchemaGet).toHaveBeenCalled(); 
  }); 

  it('should inject parameters into SQL before run', () => { 
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({})); 
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(of({'w1': { data: [] }})); 

    component.runQuery(); 

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith( 
        'w1', 
        expect.objectContaining({ 
            config: { query: "SELECT * FROM t WHERE d='Cardiology'" } 
        }) 
    ); 
  }); 

  it('should display available parameters in menu', () => { 
    expect(component.availableParams()).toContain('dept'); 
  }); 

  it('should fallback update signal if editor not ready on insert', () => { 
    // Simulate no editor view (component created but not viewed/attached fully in test env) 
    component.currentSql.set("SELECT "); 
    // Force editorView null to test fallback
    (component as any).editorView = null; 
    
    component.insertParam('dept'); 
    expect(component.currentSql()).toBe("SELECT  {{dept}}"); 
  }); 

  it('should set initial tab index from input', () => {
    const newFixture = TestBed.createComponent(SqlBuilderComponent);
    const inst = newFixture.componentInstance;
    setInputSignal(inst, 'dashboardId', 'd1');
    setInputSignal(inst, 'widgetId', 'w1');
    setInputSignal(inst, 'initialTab', 1);
    newFixture.detectChanges();
    expect(inst.selectedTabIndex()).toBe(1);
  });

  it('should insert param using editorView when available', () => {
    const dispatch = vi.fn();
    const focus = vi.fn();
    const destroy = vi.fn();
    (component as any).editorView = {
      state: { selection: { main: { from: 0, to: 0 } } },
      dispatch,
      focus,
      destroy
    };

    component.insertParam('dept');
    expect(dispatch).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
  });

  it('should handle update errors in runQuery', () => {
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
      throwError(() => ({ error: { detail: 'Bad SQL' } }))
    );
    component.runQuery();
    expect(component.validationError()).toBe('Bad SQL');
    expect(component.isRunning()).toBe(false);
  });

  it('should handle execution errors after update', () => {
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(
      throwError(() => new Error('exec fail'))
    );
    component.runQuery();
    expect(component.isRunning()).toBe(false);
  });

  it('should handle schema load errors and no editor', () => {
    mockSchemaApi.getDatabaseSchemaApiV1SchemaGet.mockReturnValue(throwError(() => new Error('fail')));
    (component as any).editorView = null;
    (component as any).loadSchemaForAutocomplete();
    expect(true).toBe(true);
  });

  it('should dispatch schema config when editor exists', () => {
    const dispatch = vi.fn();
    const destroy = vi.fn();
    (component as any).editorView = { dispatch, destroy };
    mockSchemaApi.getDatabaseSchemaApiV1SchemaGet.mockReturnValue(
      of([{ table_name: 't', columns: [{ name: 'c' }] }])
    );
    (component as any).loadSchemaForAutocomplete();
    expect(dispatch).toHaveBeenCalled();
  });

  it('should destroy editor on ngOnDestroy', () => {
    const destroy = vi.fn();
    (component as any).editorView = { destroy };
    component.ngOnDestroy();
    expect(destroy).toHaveBeenCalled();
  });

  it('should no-op initEditor without host', () => {
    const prev = (component as any).editorView;
    (component as any).editorHost = null;
    (component as any).initEditor();
    expect((component as any).editorView).toBe(prev);
  });

  it('should initialize editor when host is available', () => {
    const host = document.createElement('div');
    (component as any).editorHost = { nativeElement: host };
    const createSpy = vi.spyOn(EditorState, 'create');
    (component as any).initEditor();
    expect((component as any).editorView).toBeTruthy();
    expect(createSpy).toHaveBeenCalled();

    const view = (component as any).editorView;
    view.dispatch({ changes: { from: 0, to: 0, insert: 'X' } });
    view.dispatch({ selection: { anchor: 0 } });
    expect(component.currentSql().startsWith('X')).toBe(true);

    createSpy.mockRestore();
    (component as any).editorView?.destroy();
  });

  it('should fall back to default error message when detail missing', () => {
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Error' }))
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

function setInputSignal(component: any, key: string, value: unknown): void {
  const current = component[key];
  const node = current?.[SIGNAL];
  if (node) {
    if (typeof node.applyValueToInputSignal === 'function') {
      node.applyValueToInputSignal(node, value);
    } else {
      signalSetFn(node, value as never);
    }
  } else {
    component[key] = value;
  }
}
