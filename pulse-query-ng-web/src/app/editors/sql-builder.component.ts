/**
 * @fileoverview SQL Builder Component with CodeMirror Integration.
 *
 * Features:
 * - Full SQL Syntax Highlighting via CodeMirror 6.
 * - **Schema-Aware Autocomplete**: Fetches DB schema for table/column suggestions.
 * - Dark Theme (One Dark).
 * - Reactive SQL execution via API.
 * - Integration with Global Dashboard Parameters (e.g. {{dept}}).
 * - Result Preview Table.
 */

import {
  Component,
  input,
  output,
  inject,
  signal,
  model,
  OnInit,
  computed,
  viewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';

// CodeMirror Adapter
import { EditorView } from 'codemirror';
import { SqlCodeMirrorAdapter } from './sql-codemirror.adapter';

// Material
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

import { DashboardsService, ExecutionService, WidgetUpdate, SchemaService } from '../api-client';
import { DashboardStore } from '../dashboard/dashboard.store';
import {
  VizTableComponent,
  TableDataSet,
} from '../shared/visualizations/viz-table/viz-table.component';
import { ConversationComponent } from '../chat/conversation/conversation.component';
import { ChatStore } from '../chat/chat.store';

/** Interactive CodeMirror SQL editor and AI assistant builder component for authoring widget queries. */
@Component({
  selector: 'app-sql-builder',
  imports: [
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatTooltipModule,
    VizTableComponent,
    ConversationComponent,
  ],
  // PROVIDE CHAT STORE so that ConversationComponent (which injects it) works.

  providers: [ChatStore],

  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        min-height: 0;
      }
      .wrapper {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      /* CodeMirror Container */
      .cm-wrapper {
        flex: 0 0 220px; /* Fixed height for editor area */
        border: 1px solid var(--sys-surface-border);
        border-radius: 4px;
        overflow: hidden;
        position: relative;
        font-size: 14px;
      }
      /* CodeMirror Host Element */
      .cm-host {
        height: 100%;
        width: 100%;
        display: block;
      }

      /* Result Area */
      .result-container {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-top: 1px solid var(--sys-surface-border);
        margin-top: 8px;
        padding-top: 8px;
        background-color: var(--sys-background);
        border-radius: 4px;
      }
      .viz-scroll-wrapper {
        flex: 1;
        overflow: auto;
        min-height: 0;
      }
      .error-banner {
        background-color: var(--sys-error-container);
        color: var(--sys-on-error-container);
        padding: 8px 12px;
        font-size: 13px;
        border-left: 4px solid var(--sys-error);
        margin-bottom: 8px;
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }
      .ai-wrapper {
        height: 100%;
        width: 100%;
        overflow: hidden;
      }
    `,
  ],
  templateUrl: './sql-builder.component.html',
})
export class SqlBuilderComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Generated OpenAPI client for updating widget SQL configurations on the backend. */
  private readonly boardsApi = inject(DashboardsService);
  /** Generated OpenAPI client for executing ad-hoc SQL preview queries. */
  private readonly executionApi = inject(ExecutionService);
  /** Generated OpenAPI client for fetching DuckDB table and column metadata for autocomplete. */
  private readonly schemaApi = inject(SchemaService);
  /** Centralized reactive state store for the active hospital dashboard. */
  private readonly store = inject(DashboardStore);

  /** Dashboard Id. */
  readonly dashboardId = input.required<string>();
  /** Widget Id. */
  readonly widgetId = input.required<string>();
  /** Initial Sql. */
  readonly initialSql = input<string>('');
  /** Optional: Set which tab opens by default. 0=Code, 1=AI */
  readonly initialTab = input<number>(0);
  /** Optional: Enable cart actions for ad-hoc flows. */
  readonly enableCart = input<boolean>(false);

  /** Sql Change. */
  readonly sqlChange = output<string>();
  /** Event emitted when user saves SQL to the query cart. */
  readonly saveToCart = output<string>();

  /** Current Sql. */
  readonly currentSql = model<string>('');
  /** Whether running. */
  readonly isRunning = signal(false);
  /** Latest Result. */
  readonly latestResult = signal<TableDataSet | null>(null);
  /** Validation Error. */
  readonly validationError = signal<string | null>(null);

  /** Global Params. */
  readonly globalParams = this.store.globalParams;
  /** Available Params. */
  readonly availableParams = computed(() => Object.keys(this.globalParams()));
  /** Whether save To Cart. */
  readonly canSaveToCart = computed(() => this.currentSql().trim().length > 0);

  /** Selected Tab Index. */
  selectedTabIndex = signal(0);

  // CodeMirror References
  /** Editor Host. */
  readonly editorHost = viewChild<ElementRef<HTMLDivElement>>('editorHost');
  /** Active CodeMirror 6 EditorView instance mounted inside `editorHost`. */
  editorView?: Pick<EditorView, 'state' | 'dispatch' | 'focus' | 'destroy'> | null;
  /** Adapter encapsulating CodeMirror 6 state, theme, and SQL schema autocomplete extensions. */
  private readonly codeMirrorAdapter = new SqlCodeMirrorAdapter();

  /** Seeds `currentSql` and `selectedTabIndex` from the component's initial input bindings. */
  ngOnInit(): void {
    if (this.initialSql()) this.currentSql.set(this.initialSql());
    // Initialize tab selection from input
    this.selectedTabIndex.set(this.initialTab());
  }

  /** Ng After View Init. */
  ngAfterViewInit(): void {
    this.initEditor();
    this.loadSchemaForAutocomplete();
  }

  /** Destroys the active CodeMirror 6 `EditorView` instance when the component is torn down. */
  ngOnDestroy(): void {
    if (this.editorView) {
      this.editorView.destroy();
    }
  }

  /** Initializes the CodeMirror 6 SQL editor instance inside `editorHost`. */
  initEditor(): void {
    const host = this.editorHost();
    if (!host) return;

    this.editorView = this.codeMirrorAdapter.createEditor(
      host.nativeElement,
      this.currentSql(),
      (newCode) => {
        this.currentSql.set(newCode);
      },
    );
  }

  /** Fetches database schema metadata and reconfigures CodeMirror SQL autocomplete. */
  loadSchemaForAutocomplete(): void {
    this.schemaApi.getDatabaseSchemaApiV1SchemaGet().subscribe({
      next: (tables) => {
        if (!this.editorView) return;
        this.codeMirrorAdapter.reconfigureSchemaAutocomplete(this.editorView, tables);
      },
      error: (err) => console.warn('Failed to load schema for autocomplete', err),
    });
  }

  /**
   * Inserts a global dashboard parameter placeholder token at the current cursor position.
   *
   * @param key - The parameter name to insert as `{{key}}`.
   */
  insertParam(key: string): void {
    const token = `{{${key}}}`;
    if (this.editorView) {
      this.codeMirrorAdapter.insertTokenAtCursor(this.editorView, token);
    } else {
      this.currentSql.update((current) => current + ' ' + token);
    }
  }

  /**
   * Replaces `{{param}}` template tokens in a SQL string with current global parameter values.
   *
   * @param sqlTemplate - The SQL template string containing parameter tokens.
   * @returns Compiled SQL string with parameter values injected.
   */
  private injectParameters(sqlTemplate: string): string {
    let processed = sqlTemplate;
    const params = this.globalParams();
    Object.entries(params).forEach(([key, val]) => {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      processed = processed.replace(regex, String(val));
    });
    return processed;
  }

  /**
   * Feature 2 Fix: Checks result error property to display feedback instead of empty table.
   */
  runQuery(): void {
    this.isRunning.set(true);
    this.validationError.set(null);

    const runnableSql = this.injectParameters(this.currentSql());
    const update: WidgetUpdate = { config: { query: runnableSql } };

    this.boardsApi
      .updateWidgetApiV1DashboardsWidgetsWidgetIdPut(this.widgetId(), update)
      .subscribe({
        next: () => {
          this.sqlChange.emit(this.currentSql());
          this.executionApi
            .refreshDashboardApiV1DashboardsDashboardIdRefreshPost(this.dashboardId())
            .pipe(finalize(() => this.isRunning.set(false)))
            .subscribe({
              next: (map: Record<string, TableDataSet & { error?: string }>) => {
                const result = map[this.widgetId()];

                // Logic Fix: Check for embedded error from backend runner
                if (result && result.error) {
                  this.validationError.set(result.error);
                  this.latestResult.set(null); // Clear table to avoid ghost rendering
                } else {
                  this.latestResult.set(result as TableDataSet);
                }
              },
              error: () => this.validationError.set($localize`Network execution failed.`),
            });
        },
        error: (err: HttpErrorResponse) => {
          this.isRunning.set(false);
          let msg = $localize`Failed to save query.`;
          const errBody = err.error as { detail?: unknown } | null | undefined;
          if (errBody && errBody.detail) msg = String(errBody.detail);
          this.validationError.set(msg);
        },
      });
  }

  /** Emits the current SQL to the query cart. */
  saveQueryToCart(): void {
    if (!this.canSaveToCart()) return;
    this.saveToCart.emit(this.currentSql());
  }
}
