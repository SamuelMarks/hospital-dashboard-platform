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
  OnDestroy 
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
import { VizTableComponent, TableDataSet } from '../shared/visualizations/viz-table/viz-table.component'; 
import { ConversationComponent } from '../chat/conversation/conversation.component'; 
import { ChatStore } from '../chat/chat.store'; 

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
    ConversationComponent
  ], 
  // PROVIDE CHAT STORE so that ConversationComponent (which injects it) works. 
  providers: [ChatStore], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; min-height: 0; } 
    .wrapper { display: flex; flex-direction: column; height: 100%; overflow: hidden; } 
    
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
    .cm-host { height: 100%; width: 100%; display: block; } 

    /* Result Area */ 
    .result-container { 
      flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; 
      border-top: 1px solid var(--sys-surface-border); margin-top: 8px; padding-top: 8px; 
      background-color: var(--sys-background); border-radius: 4px; 
    } 
    .viz-scroll-wrapper { flex: 1; overflow: auto; min-height: 0; } 
    .error-banner { 
      background-color: #fce4ec; color: #c62828; padding: 8px 12px; font-size: 13px; 
      border-left: 4px solid #c62828; margin-bottom: 8px; display: flex; align-items: flex-start; gap: 8px; 
    } 
    .ai-wrapper { 
      height: 100%; width: 100%; overflow: hidden; 
    } 
  `], 
  template: `
    <div class="wrapper">
      <mat-tab-group class="flex-grow flex flex-col" style="height:100%" [(selectedIndex)]="selectedTabIndex" animationDuration="0ms">

        <mat-tab label="Code Editor">
          <div class="flex flex-col h-full p-4 gap-4 overflow-hidden">
            
            <!-- Error Banner -->
            @if (validationError()) { 
              <div class="error-banner" data-testid="error-banner" role="alert">
                <mat-icon class="icon-sm" style="font-size:18px; width:18px; height:18px">cancel</mat-icon>
                <div class="flex-1">
                  <strong>Syntax Error:</strong> {{ validationError() }} 
                </div>
                <button mat-icon-button class="icon-btn-micro" (click)="validationError.set(null)" aria-label="Dismiss Error">
                  <mat-icon style="font-size:16px;">close</mat-icon>
                </button>
              </div>
            } 

            <!-- 1. CodeMirror Editor Region -->
            <div class="cm-wrapper shadow-inner">
              <div #editorHost class="cm-host"></div>
            </div>

            <!-- 2. Action Bar -->
            <div class="flex justify-between items-center flex-shrink-0">
              
              <!-- Parameters Injection Menu -->
              <button mat-stroked-button [matMenuTriggerFor]="paramsMenu" matTooltip="Inject Global Filters">
                <mat-icon class="mr-1">data_object</mat-icon> Insert Param
              </button>
              <mat-menu #paramsMenu="matMenu">
                @for (key of availableParams(); track key) { 
                  <button mat-menu-item (click)="insertParam(key)">
                    <span>{{ '{' + '{' + key + '}' + '}' }}</span>
                    <span class="text-xs ml-2" style="color: var(--sys-text-secondary)">({{ globalParams()[key] }})</span>
                  </button>
                } 
                @if (availableParams().length === 0) { 
                  <div class="px-4 py-2 text-xs" style="color: var(--sys-text-secondary)">No global params set</div>
                } 
              </mat-menu>

              <div class="flex gap-2">
                <button mat-flat-button color="accent" (click)="runQuery()" [disabled]="isRunning()">
                   @if (isRunning()) { <mat-spinner diameter="20" class="mr-2"></mat-spinner> } 
                   Run Query
                </button>
              </div>
            </div>

            <!-- 3. Result Table -->
            <div class="result-container">
               <div class="viz-scroll-wrapper">
                 @if (latestResult(); as res) { 
                   <viz-table [dataSet]="res" class="h-full block w-full"></viz-table> 
                 } 
                 @else if (isRunning()) { 
                   <div class="flex items-center justify-center h-full" style="color: var(--sys-text-secondary)">Executing...</div>
                 } 
                 @else { 
                   <div class="flex items-center justify-center h-full" style="color: var(--sys-text-secondary)">Run query to see results</div>
                 } 
               </div>
            </div>
          </div>
        </mat-tab>

        <!-- AI Tab: Implements the Conversation UI requirements -->
        <mat-tab label="AI Assistant">
           <div class="ai-wrapper">
             <app-conversation class="h-full"></app-conversation>
           </div>
        </mat-tab>

      </mat-tab-group>
    </div>
  `
}) 
export class SqlBuilderComponent implements OnInit, AfterViewInit, OnDestroy { 
  private readonly boardsApi = inject(DashboardsService); 
  private readonly executionApi = inject(ExecutionService); 
  private readonly schemaApi = inject(SchemaService); 
  private readonly store = inject(DashboardStore); 

  readonly dashboardId = input.required<string>(); 
  readonly widgetId = input.required<string>(); 
  readonly initialSql = input<string>(''); 
  /** Optional: Set which tab opens by default. 0=Code, 1=AI */
  readonly initialTab = input<number>(0); 
  
  readonly sqlChange = output<string>(); 

  readonly currentSql = model<string>(''); 
  readonly isRunning = signal(false); 
  readonly latestResult = signal<TableDataSet | null>(null); 
  readonly validationError = signal<string | null>(null); 
  
  readonly globalParams = this.store.globalParams; 
  readonly availableParams = computed(() => Object.keys(this.globalParams())); 

  selectedTabIndex = signal(0); 

  // CodeMirror References
  @ViewChild('editorHost') editorHost!: ElementRef<HTMLDivElement>; 
  private editorView?: EditorView; 
  private languageConf = new Compartment(); 

  ngOnInit() { 
    if (this.initialSql()) this.currentSql.set(this.initialSql()); 
    // Initialize tab selection from input
    this.selectedTabIndex.set(this.initialTab()); 
  } 

  ngAfterViewInit(): void { 
    this.initEditor(); 
    this.loadSchemaForAutocomplete(); 
  } 

  ngOnDestroy(): void { 
    if (this.editorView) { 
      this.editorView.destroy(); 
    } 
  } 

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
          "&": { height: "100%" }, 
          ".cm-scroller": { overflow: "auto" } 
        }) 
      ] 
    }); 

    this.editorView = new EditorView({ 
      state: startState, 
      parent: this.editorHost.nativeElement
    }); 
  } 

  private loadSchemaForAutocomplete(): void { 
    this.schemaApi.getDatabaseSchemaApiV1SchemaGet().subscribe({ 
      next: (tables) => { 
        if (!this.editorView) return; 
        const schemaConfig: { [key: string]: string[] } = {}; 
        tables.forEach(t => { 
          schemaConfig[t.table_name] = t.columns.map(c => c.name); 
        }); 
        this.editorView.dispatch({ 
          effects: this.languageConf.reconfigure(sql({ 
            dialect: PostgreSQL, 
            schema: schemaConfig, 
            upperCaseKeywords: true
          })) 
        }); 
      }, 
      error: (err) => console.warn('Failed to load schema for autocomplete', err) 
    }); 
  } 

  insertParam(key: string): void { 
    const token = `{{${key}}}`; 
    if (this.editorView) { 
      const state = this.editorView.state; 
      const range = state.selection.main; 
      this.editorView.dispatch({ 
        changes: { from: range.from, to: range.to, insert: token }, 
        selection: { anchor: range.from + token.length } 
      }); 
      this.editorView.focus(); 
    } else { 
      this.currentSql.update(current => current + ' ' + token); 
    } 
  } 

  private injectParameters(sqlTemplate: string): string { 
    let processed = sqlTemplate; 
    const params = this.globalParams(); 
    Object.entries(params).forEach(([key, val]) => { 
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'); 
      processed = processed.replace(regex, String(val)); 
    }); 
    return processed; 
  } 

  runQuery() { 
    this.isRunning.set(true); 
    this.validationError.set(null); 

    const runnableSql = this.injectParameters(this.currentSql()); 
    const update: WidgetUpdate = { config: { query: runnableSql } }; 
    
    this.boardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(this.widgetId(), update) 
      .subscribe({ 
        next: () => { 
          this.sqlChange.emit(this.currentSql()); 
          this.executionApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost(this.dashboardId()) 
            .pipe(finalize(() => this.isRunning.set(false))) 
            .subscribe({ 
              next: (map) => this.latestResult.set(map[this.widgetId()] as TableDataSet), 
              error: () => { } 
            }); 
        }, 
        error: (err: HttpErrorResponse) => { 
          this.isRunning.set(false); 
          let msg = 'Failed to save query.'; 
          if (err.error && err.error.detail) msg = String(err.error.detail); 
          this.validationError.set(msg); 
        } 
      }); 
  } 
}