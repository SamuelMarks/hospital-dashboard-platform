/**
 * @fileoverview SQL Builder Component with Syntax Highlighting and Parameter Injection.
 * 
 * Features:
 * - Code Editor with simple SQL syntax highlighting.
 * - Reactive SQL execution via API.
 * - Integration with Global Dashboard Parameters (e.g. {{dept}}).
 * - Result Preview Table.
 */

import { Component, input, output, inject, signal, ChangeDetectionStrategy, model, OnInit, computed } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { FormsModule } from '@angular/forms'; 
import { HttpErrorResponse } from '@angular/common/http'; 
import { finalize } from 'rxjs/operators'; 
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'; 

// Material
import { MatTabsModule } from '@angular/material/tabs'; 
import { MatButtonModule } from '@angular/material/button'; 
import { MatIconModule } from '@angular/material/icon'; 
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'; 
import { MatMenuModule } from '@angular/material/menu'; 
import { MatTooltipModule } from '@angular/material/tooltip';

import { DashboardsService, ExecutionService, WidgetUpdate } from '../api-client'; 
import { DashboardStore } from '../dashboard/dashboard.store'; 
import { VizTableComponent, TableDataSet } from '../shared/visualizations/viz-table/viz-table.component'; 

/**
 * SQL Builder Editor.
 * 
 * **Accessibility (a11y):** 
 * - The raw `textarea` is now labeled via `aria-label="SQL Code Editor"`.
 * - Line numbers are hidden from screen readers (`aria-hidden="true"`) to prevent verbose readout interference.
 */
@Component({ 
  selector: 'app-sql-builder', 
  // 'standalone: true' removed (default).
  imports: [
    CommonModule, 
    FormsModule, 
    MatTabsModule, 
    MatButtonModule, 
    MatIconModule, 
    MatProgressSpinnerModule, 
    MatMenuModule, 
    MatTooltipModule,
    VizTableComponent
  ], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; min-height: 0; } 
    .wrapper { display: flex; flex-direction: column; height: 100%; overflow: hidden; } 
    /* Editor Configuration */ 
    .editor-wrapper { 
      position: relative; 
      background: #1e1e1e; 
      color: #d4d4d4; 
      font-family: 'Consolas', 'Monaco', monospace; 
      font-size: 14px; 
      line-height: 1.5; 
      border-radius: 4px; 
      overflow: hidden; 
      margin-bottom: 1px; 
      flex: 0 0 220px; 
      display: flex; 
    } 
    .line-numbers { 
      padding: 10px 5px; 
      background: #252526; 
      color: #858585; 
      text-align: right; 
      min-width: 40px; 
      border-right: 1px solid #333; 
      user-select: none; 
    } 
    .code-area { flex: 1; position: relative; } 
    textarea.raw-input { 
      position: absolute; top: 0; left: 0; width: 100%; height: 100%; padding: 10px; 
      background: transparent; color: transparent; caret-color: white; 
      border: none; resize: none; outline: none; z-index: 2; overflow: auto; white-space: pre; 
    } 
    .highlight-layer { 
      position: absolute; top: 0; left: 0; width: 100%; height: 100%; padding: 10px; 
      z-index: 1; overflow: hidden; white-space: pre; pointer-events: none; 
    } 
    /* Syntax Colors */ 
    .kwd { color: #569cd6; font-weight: bold; } 
    .str { color: #ce9178; } 
    .num { color: #b5cea8; } 
    .param-token { color: #d7ba7d; font-weight: bold; } 
    
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
    .ai-placeholder { background-color: var(--sys-surface); color: var(--sys-text-secondary); } 
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

            <!-- 1. Editor Region -->
            <div class="editor-wrapper shadow-inner">
              <div class="line-numbers" aria-hidden="true">
                @for (n of lineNumbers(); track n) { <div>{{n}}</div> } 
              </div>
              <div class="code-area">
                <div class="highlight-layer" [innerHTML]="highlightedCode()"></div>
                <textarea
                  class="raw-input" 
                  [(ngModel)]="currentSql" 
                  (input)="syncScroll($event)" 
                  (scroll)="syncScroll($event)" 
                  spellcheck="false" 
                  placeholder="SELECT * FROM table..." 
                  aria-label="SQL Code Editor"
                ></textarea>
              </div>
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
                <button mat-stroked-button (click)="formatSql()">Format</button>
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

        <!-- AI Tab -->
        <mat-tab label="AI Assistant">
           <div class="p-4 flex flex-col h-full overflow-hidden ai-placeholder">
             <div class="flex items-center justify-center h-full" style="color: var(--sys-text-secondary)">AI Chat Placeholder</div>
           </div>
        </mat-tab>

      </mat-tab-group>
    </div>
  `
}) 
export class SqlBuilderComponent implements OnInit { 
  private readonly boardsApi = inject(DashboardsService); 
  private readonly executionApi = inject(ExecutionService); 
  private readonly sanitizer = inject(DomSanitizer); 
  private readonly store = inject(DashboardStore); 

  readonly dashboardId = input.required<string>(); 
  readonly widgetId = input.required<string>(); 
  readonly initialSql = input<string>(''); 
  readonly sqlChange = output<string>(); 

  readonly currentSql = model<string>(''); 
  readonly isRunning = signal(false); 
  readonly latestResult = signal<TableDataSet | null>(null); 
  readonly validationError = signal<string | null>(null); 
  
  readonly globalParams = this.store.globalParams; 
  readonly availableParams = computed(() => Object.keys(this.globalParams())); 

  selectedTabIndex = signal(0); 

  ngOnInit() { if(this.initialSql()) this.currentSql.set(this.initialSql()); } 

  lineNumbers() { return Array.from({ length: this.currentSql().split('\n').length }, (_, i) => i + 1); } 

  syncScroll(e: Event) { 
    const target = e.target as HTMLTextAreaElement; 
    const highlight = target.parentElement?.querySelector('.highlight-layer'); 
    if (highlight) { 
      highlight.scrollTop = target.scrollTop; 
      highlight.scrollLeft = target.scrollLeft; 
    } 
  } 

  /** Formats SQL Code for highlight layer (Visual only) */
  highlightedCode(): SafeHtml { 
    let code = this.currentSql() || ''; 
    code = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); 
    const keywords = /\b(SELECT|FROM|WHERE|GROUP|BY|ORDER|LIMIT|JOIN|LEFT|RIGHT|INNER|ON|AND|OR|AS|COUNT|SUM|AVG|MAX|MIN)\b/gi; 
    code = code.replace(keywords, '<span class="kwd">$1</span>'); 
    code = code.replace(/'([^']*)'/g, '<span class="str">\'$1\'</span>'); 
    code = code.replace(/\b(\d+)\b/g, '<span class="num">$1</span>'); 
    // Highlight Params {{param}} 
    code = code.replace(/(\{\{\s*[a-zA-Z0-9_]+\s*\}\})/g, '<span class="param-token">$1</span>'); 
    return this.sanitizer.bypassSecurityTrustHtml(code + '<br>'); 
  } 

  formatSql() { 
    let sql = this.currentSql(); 
    sql = sql.replace(/\s+/g, ' ').replace(/\s(FROM|WHERE|GROUP|ORDER|LIMIT)\s/gi, '\n$1 '); 
    this.currentSql.set(sql); 
  } 

  insertParam(key: string) { 
    const token = `{{${key}}}`; 
    this.currentSql.update(current => current + ' ' + token); 
  } 

  /** 
   * Pre-processes the SQL to inject current global parameter values 
   * BEFORE sending to the backend for execution/storage. 
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
              error: () => { /* Interceptor handles global notification */ } 
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