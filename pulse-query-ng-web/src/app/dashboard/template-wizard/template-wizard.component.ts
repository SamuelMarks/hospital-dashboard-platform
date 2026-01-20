/**
 * @fileoverview Widget Creation Wizard.
 *
 * Orchestrates a multi-step process:
 * 1. Select Template (or Custom SQL).
 * 2. Configure Parameters (via Dynamic Form).
 * 3. Preview Execution (Defer loaded VizTable).
 * 4. Save/Commit.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Subject, Subscription } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

// Material Imports
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatStepperModule } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { provideNativeDateAdapter } from '@angular/material/core';

import {
  DashboardsService,
  ExecutionService,
  TemplatesService,
  TemplateResponse,
  WidgetIn,
  WidgetCreateSql, // Import subtype
  WidgetUpdate
} from '../../api-client';
import { VizTableComponent, TableDataSet } from '../../shared/visualizations/viz-table/viz-table.component';
import { DynamicFormComponent } from './dynamic-form.component';

export interface WizardData {
  dashboardId: string;
}

@Component({
  selector: 'app-template-wizard',
  providers: [provideNativeDateAdapter()],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatStepperModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatCardModule,
    VizTableComponent, // Imported for usage in @defer block
    DynamicFormComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './template-wizard.component.html',
  styles: [`
    :host {
      display: flex; flex-direction: column; width: 1000px; height: 85vh; max-height: 900px;
    }
    /* Template Grid Layout */
    .template-grid {
      display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-content: start;
    }
    .template-card {
      cursor: pointer; height: 140px; display: flex; flex-direction: column;
      transition: all 0.2s; border: 1px solid transparent; /* Fix for high contrast */
    }
    .template-card.selected-card {
      background-color: var(--sys-selected); border-color: var(--sys-primary) !important;
    }
    .template-card:hover:not(.selected-card) {
      border-color: var(--sys-surface-border); background-color: var(--sys-hover);
    }

    /* Editor styles */
    .editor-wrapper {
      position: relative; background: #1e1e1e; color: #d4d4d4;
      font-family: 'Consolas', monospace; font-size: 14px; overflow: hidden;
    }
    textarea.raw-input {
      position: absolute; inset: 0; padding: 12px; background: transparent;
      color: transparent; caret-color: white; border: none; resize: none; z-index: 2;
    }
    .highlight-layer {
      position: absolute; inset: 0; padding: 12px; z-index: 1; pointer-events: none;
    }
    /* Tokens */
    ::ng-deep .kwd { color: #569cd6; font-weight: bold; }
    ::ng-deep .str { color: #ce9178; }
    ::ng-deep .num { color: #b5cea8; }
  `]
})
export class TemplateWizardComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<TemplateWizardComponent>);
  private readonly dashboardsApi = inject(DashboardsService);
  private readonly executionApi = inject(ExecutionService);
  private readonly templatesApi = inject(TemplatesService);
  private readonly data = inject<WizardData>(MAT_DIALOG_DATA);
  private readonly sanitizer = inject(DomSanitizer);

  // --- State ---
  readonly templates = signal<TemplateResponse[]>([]);
  readonly categories = signal<string[]>(['Predictive', 'Operational', 'Capacity', 'Clinical', 'Financial']);
  readonly loadingTemplates = signal(false);
  readonly selectedCategory = signal<string | null>(null);
  readonly selectedTemplateId = signal<string | null>(null);

  // --- RxJS for Search Debounce ---
  private readonly searchSubject = new Subject<string>();
  private searchSub?: Subscription;
  private modeSub?: Subscription;

  // --- Wizard Logic ---
  readonly paramsSchema = signal<Record<string, any>>({});
  readonly finalSql = signal<string>('');
  readonly isRunning = signal(false);
  readonly executionResult = signal<any | null>(null);
  readonly draftWidgetId = signal<string | null>(null);

  readonly paramsValue = signal<Record<string, any>>({});
  readonly paramsValid = signal(false);

  // Form Group
  readonly selectionForm = this.fb.group({
    mode: ['predefined', Validators.required],
    templateId: [''],
    rawSql: ['']
  });

  readonly placeholderText = "SELECT * FROM table WHERE col = '{{param}}'";

  ngOnInit(): void {
    this.createDraftWidget();
    this.loadTemplates();

    this.searchSub = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(term => this.loadTemplates(term));

    // Handle Validation Switch
    this.modeSub = this.selectionForm.get('mode')?.valueChanges.subscribe(mode => {
      const tplCtrl = this.selectionForm.get('templateId');
      const sqlCtrl = this.selectionForm.get('rawSql');

      if (mode === 'predefined') {
        tplCtrl?.setValidators([Validators.required]);
        sqlCtrl?.clearValidators();
      } else {
        tplCtrl?.clearValidators();
        sqlCtrl?.setValidators([Validators.required]);
      }
      tplCtrl?.updateValueAndValidity();
      sqlCtrl?.updateValueAndValidity();
    });
  }

  ngOnDestroy(): void {
    this.searchSub?.unsubscribe();
    this.modeSub?.unsubscribe();
  }

  loadTemplates(searchTerm?: string) {
    this.loadingTemplates.set(true);
    const cat = this.selectedCategory() || undefined;
    const search = searchTerm && searchTerm.trim().length > 0 ? searchTerm : undefined;

    this.templatesApi.listTemplatesApiV1TemplatesGet(cat, search, 30)
      .pipe(finalize(() => this.loadingTemplates.set(false)))
      .subscribe({
        next: (data) => this.templates.set(data),
        error: (err) => console.error('Failed to load templates', err)
      });
  }

  selectTemplate(template: TemplateResponse) {
    this.selectedTemplateId.set(template.id);
    this.selectionForm.patchValue({
      templateId: template.id,
      rawSql: template.sql_template
    });
    this.paramsSchema.set(template.parameters_schema || {});
  }

  toggleCategory(cat: string) {
    const newCat = this.selectedCategory() === cat ? null : cat;
    this.selectedCategory.set(newCat);
    this.loadTemplates();
  }

  updateSearch(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.searchSubject.next(val);
  }

  /** Logic to skip parameter step if none exist. */
  parseParams() {
    const mode = this.selectionForm.value.mode;
    if (mode !== 'predefined') {
      this.paramsSchema.set({});
      this.paramsValid.set(true);
    } else {
      const schema = this.paramsSchema();
      // Fix: Access properties safely
      if (!schema['properties'] || Object.keys(schema['properties']).length === 0) {
        this.paramsValid.set(true);
      }
    }
  }

  handleFormChange(values: Record<string, any>) { this.paramsValue.set(values); }
  handleStatusChange(status: 'VALID' | 'INVALID') { this.paramsValid.set(status === 'VALID'); }

  /** Compiles Template + Params into Final SQL. */
  renderPreview() {
    // Logic handles {{ mustache }} replacement
    let sql = this.selectionForm.value.rawSql || '';
    const values = this.paramsValue();

    Object.keys(values).forEach(key => {
      let val = values[key];
      sql = sql.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(val));
    });

    this.finalSql.set(sql);
    this.executeDraft(sql);
  }

  saveWidget() {
    const draftId = this.draftWidgetId();
    if (!draftId) return;

    // Determine title
    let title = 'Custom SQL Widget';
    if (this.selectionForm.value.mode === 'predefined') {
      const t = this.templates().find(x => x.id === this.selectionForm.value.templateId);
      if (t) title = t.title;
    }

    const update: WidgetUpdate = {
        title: title,
        config: { query: this.finalSql() }
    };

    this.dashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(draftId, update)
        .subscribe(() => {
            this.draftWidgetId.set(null); // Prevent deletion in onDestroy/cancel
            this.dialogRef.close(true);
        });
  }

  cancel() {
    const draftId = this.draftWidgetId();
    if (draftId) {
      this.dashboardsApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(draftId)
        .subscribe(() => this.dialogRef.close(false));
    } else {
      this.dialogRef.close(false);
    }
  }

  private createDraftWidget() {
    // Creates a placeholder to execute queries against
    // Use proper subtype
    const createReq: WidgetCreateSql = {
      title: 'Draft - Template Wizard',
      type: 'SQL',
      visualization: 'table',
      config: { query: 'SELECT 1' }
    };

    this.dashboardsApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost(this.data.dashboardId, createReq)
        .subscribe((w: any) => this.draftWidgetId.set(w.id));
  }

  private executeDraft(sql: string) {
    const draftId = this.draftWidgetId();
    if (!draftId) return;

    this.isRunning.set(true);

    // Update Query -> Refresh Execution -> Fetch Result
    this.dashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(draftId, { config: { query: sql } })
        .subscribe({
            next: () => {
                // Fix: Pass necessary args for refresh (id, auth, body) where auth can be undefined
                this.executionApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost(this.data.dashboardId, undefined)
                    .pipe(finalize(() => this.isRunning.set(false)))
                    .subscribe((resMap: any) => {
                        this.executionResult.set(resMap[draftId]);
                    });
            },
            error: () => {
                this.isRunning.set(false);
                this.executionResult.set({ error: 'Failed to execute query' });
            }
        });
  }

  asTableData(res: any): TableDataSet { return res as TableDataSet; }

  highlightedSql(): SafeHtml {
    // Simple Syntax Highlighter for visual feedback
    let code = this.finalSql() || '';
    code = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const keywords = /\b(SELECT|FROM|WHERE|GROUP|BY|ORDER|LIMIT|JOIN|LEFT|RIGHT|INNER|ON|AND|OR|AS)\b/gi;
    code = code.replace(keywords, '<span class="kwd">$1</span>');
    code = code.replace(/'([^']*)'/g, '<span class="str">\'$1\'</span>');
    code = code.replace(/\b(\d+)\b/g, '<span class="num">$1</span>');
    return this.sanitizer.bypassSecurityTrustHtml(code + '<br>');
  }

  syncScroll(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    const highlight = target.parentElement?.querySelector('.highlight-layer');
    if (highlight) {
      highlight.scrollTop = target.scrollTop;
      highlight.scrollLeft = target.scrollLeft;
    }
  }
}