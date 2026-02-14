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
  ChangeDetectionStrategy,
  model,
  OnInit,
  computed,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';

// CodeMirror Imports
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';

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

/** Sql Builder component. */
@Component({
  selector: 'app-sql-builder',
  imports: [
    CommonModule,
    FormsModule,
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
  /* v8 ignore start */
  providers: [ChatStore],
  /* v8 ignore stop */
  changeDetection: ChangeDetectionStrategy.OnPush,
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
        background-color: #fce4ec;
        color: #c62828;
        padding: 8px 12px;
        font-size: 13px;
        border-left: 4px solid #c62828;
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
/* v8 ignore start */
export class SqlBuilderComponent implements OnInit, AfterViewInit, OnDestroy {
  /* v8 ignore stop */
  /** boardsApi property. */
  private readonly boardsApi = inject(DashboardsService);
  /** executionApi property. */
  private readonly executionApi = inject(ExecutionService);
  /** schemaApi property. */
  private readonly schemaApi = inject(SchemaService);
  /** store property. */
  private readonly store = inject(DashboardStore);

  /** Dashboard Id. */
  /* istanbul ignore next */
  readonly dashboardId = input.required<string>();
  /** Widget Id. */
  /* istanbul ignore next */
  readonly widgetId = input.required<string>();
  /** Initial Sql. */
  /* istanbul ignore next */
  readonly initialSql = input<string>('');
  /** Optional: Set which tab opens by default. 0=Code, 1=AI */
  /* istanbul ignore next */
  readonly initialTab = input<number>(0);
  /** Optional: Enable cart actions for ad-hoc flows. */
  /* istanbul ignore next */
  readonly enableCart = input<boolean>(false);

  /** Sql Change. */
  readonly sqlChange = output<string>();
  /** Event emitted when user saves SQL to the query cart. */
  readonly saveToCart = output<string>();

  /** Current Sql. */
  /* istanbul ignore next */
  readonly currentSql = model<string>('');
  /** Whether running. */
  /* istanbul ignore next */
  readonly isRunning = signal(false);
  /** Latest Result. */
  /* istanbul ignore next */
  readonly latestResult = signal<TableDataSet | null>(null);
  /** Validation Error. */
  /* istanbul ignore next */
  readonly validationError = signal<string | null>(null);

  /** Global Params. */
  readonly globalParams = this.store.globalParams;
  /** Available Params. */
  /* istanbul ignore next */
  readonly availableParams = computed(() => Object.keys(this.globalParams()));
  /** Whether save To Cart. */
  /* istanbul ignore next */
  readonly canSaveToCart = computed(() => this.currentSql().trim().length > 0);

  /** Selected Tab Index. */
  /* istanbul ignore next */
  selectedTabIndex = signal(0);

  // CodeMirror References
  /** Editor Host. */
  @ViewChild('editorHost') editorHost!: ElementRef<HTMLDivElement>;
  /** editorView property. */
  private editorView?: EditorView;
  /** languageConf property. */
  private languageConf = new Compartment();

  /** Ng On Init. */
  ngOnInit() {
    if (this.initialSql()) this.currentSql.set(this.initialSql());
    // Initialize tab selection from input
    this.selectedTabIndex.set(this.initialTab());
  }

  /** Ng After View Init. */
  ngAfterViewInit(): void {
    this.initEditor();
    this.loadSchemaForAutocomplete();
  }

  /** Ng On Destroy. */
  ngOnDestroy(): void {
    if (this.editorView) {
      this.editorView.destroy();
    }
  }

  /** initEditor method. */
  private initEditor(): void {
    if (!this.editorHost) return;

    // Initial state setup with default SQL language
    const startState = EditorState.create({
      doc: this.currentSql(),
      extensions: [
        basicSetup,
        keymap.of(defaultKeymap),

        // Use Compartment to wrap SQL extension for future updates
        this.languageConf.of(sql({ dialect: PostgreSQL })),

        oneDark, // Dark Theme
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newCode = update.state.doc.toString();
            this.currentSql.set(newCode);
          }
        }),
        // Custom styling for host to ensure full height fill
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    });

    this.editorView = new EditorView({
      state: startState,
      parent: this.editorHost.nativeElement,
    });
  }

  /** loadSchemaForAutocomplete method. */
  private loadSchemaForAutocomplete(): void {
    this.schemaApi.getDatabaseSchemaApiV1SchemaGet().subscribe({
      next: (tables) => {
        if (!this.editorView) return;
        const schemaConfig: { [key: string]: string[] } = {};
        tables.forEach((t) => {
          schemaConfig[t.table_name] = t.columns.map((c) => c.name);
        });
        this.editorView.dispatch({
          effects: this.languageConf.reconfigure(
            sql({
              dialect: PostgreSQL,
              schema: schemaConfig,
              upperCaseKeywords: true,
            }),
          ),
        });
      },
      error: (err) => console.warn('Failed to load schema for autocomplete', err),
    });
  }

  /** Insert Param. */
  insertParam(key: string): void {
    const token = `{{${key}}}`;
    if (this.editorView) {
      const state = this.editorView.state;
      const range = state.selection.main;
      this.editorView.dispatch({
        changes: { from: range.from, to: range.to, insert: token },
        selection: { anchor: range.from + token.length },
      });
      this.editorView.focus();
    } else {
      this.currentSql.update((current) => current + ' ' + token);
    }
  }

  /** injectParameters method. */
  private injectParameters(sqlTemplate: string): string {
    let processed = sqlTemplate;
    const params = this.globalParams();
    Object.entries(params).forEach(([key, val]) => {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      processed = processed.replace(regex, String(val));
    });
    return processed;
  }

  /** Run Query. */
  runQuery() {
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
              next: (map) => this.latestResult.set(map[this.widgetId()] as TableDataSet),
              error: () => {},
            });
        },
        error: (err: HttpErrorResponse) => {
          this.isRunning.set(false);
          let msg = 'Failed to save query.';
          if (err.error && err.error.detail) msg = String(err.error.detail);
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
