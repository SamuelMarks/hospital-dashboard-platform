/**
 * @fileoverview Signal-based store for the Widget Builder wizard (`WidgetBuilderComponent`).
 *
 * Manages template marketplace filtering, client-memory draft widget configuration,
 * single-query SQL preview execution (`/api/v1/ai/execute`), and final widget persistence.
 */

import { DestroyRef, Service, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatStepper } from '@angular/material/stepper';
import { Subject, merge } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, skip } from 'rxjs/operators';
import {
  AiService,
  DashboardsService,
  TemplateResponse,
  TemplatesService,
  WidgetIn,
  WidgetResponse,
  WidgetUpdate,
} from '../../api-client';
import { LoggerService } from '../../core/logging/logger.service';
import {
  buildHttpWidgetConfig,
  buildSqlWidgetConfig,
  buildTextWidgetConfig,
  interpolateSqlTemplate,
} from '../dashboard-grid-layout.utils';
import { extractWidgetColumns } from '../dashboard.models';
import { DashboardStore } from '../dashboard.store';
import { VisualizationOption } from './widget-builder-visualize-step.component';

/** Sentinel ID used for client-memory draft widgets prior to final persistence. */
export const LOCAL_DRAFT_WIDGET_ID = 'draft-local';

/**
 *Canonical visualization options supported across frontend and backend.
 */
export const CANONICAL_VISUALIZATIONS: VisualizationOption[] = [
  { id: 'table', icon: 'table_chart', label: $localize`Table` },
  { id: 'metric', icon: 'exposure_plus_1', label: $localize`Metric Card` },
  { id: 'bar_chart', icon: 'bar_chart', label: $localize`Bar Chart` },
  { id: 'pie_chart', icon: 'pie_chart', label: $localize`Pie Chart` },
  { id: 'line_chart', icon: 'show_chart', label: $localize`Line Chart` },
  { id: 'heatmap', icon: 'grid_on', label: $localize`Heatmap` },
];

/**
 * Signal-based store managing `WidgetBuilderComponent` wizard state and API interactions.
 */
@Service()
export class WidgetBuilderStore {
  /** DestroyRef used for declarative RxJS stream teardown. */
  private readonly destroyRef = inject(DestroyRef);
  /** Dashboard CRUD API client. */
  private readonly dashboardApi = inject(DashboardsService);
  /** Template marketplace API client. */
  private readonly templatesApi = inject(TemplatesService);
  /** AI single-query preview execution API client. */
  private readonly aiApi = inject(AiService);
  /** Active dashboard state store. */
  private readonly dashboardStore = inject(DashboardStore);
  /** Centralized diagnostic logger. */
  private readonly logger = inject(LoggerService);

  /** Active wizard mode (Template vs Custom). */
  readonly activeMode = signal<'template' | 'custom' | null>(null);
  /** Currently selected template object. */
  readonly selectedTemplate = signal<TemplateResponse | null>(null);
  /** Currently selected custom type. */
  readonly selectedCustomType = signal<'SQL' | 'HTTP' | 'TEXT' | null>(null);
  /** The client-memory (or persisted) draft widget being configured. */
  readonly draftWidget = signal<WidgetResponse | null>(null);
  /** Whether the widget allows the user to enter natural text on the dashboard. */
  readonly allowNaturalText = signal<boolean>(false);
  /** Selected processor ID (`'SQL'`, `'ollama:<model>'`, or `'<provider>:<model>'`). */
  readonly selectedProcessor = signal<string>('SQL');
  /** Default or saved natural text prompt for this widget. */
  readonly naturalTextPrompt = signal<string>('');
  /** Optional custom placeholder text for the widget's natural text input. */
  readonly placeholderText = signal<string>('');

  /** List of available templates. */
  readonly templates = signal<TemplateResponse[]>([]);
  /** Template loading state. */
  readonly loadingTemplates = signal(false);
  /** Global busy/saving state. */
  readonly isBusy = signal(false);
  /** Filter categories for templates. */
  readonly categories = signal<string[]>([
    'Operational',
    'Clinical',
    'Capacity',
    'Financial',
    'Flow',
  ]);
  /** Currently active category filter. */
  readonly selectedCategory = signal<string | null>(null);
  /** Debounced template search query signal. */
  readonly searchQuery = signal<string>('');
  /** Synchronous search input stream merged with `toObservable(searchQuery)`. */
  private readonly searchInput$ = new Subject<string>();

  /** ID of the selected template. */
  readonly selectedTemplateId = computed(() => this.selectedTemplate()?.id);
  /** ID of the current draft widget. */
  readonly draftWidgetId = computed(() => this.draftWidget()?.id);
  /** Parameters schema from selected template. */
  readonly paramsSchema = computed(() => this.selectedTemplate()?.parameters_schema || {});

  /** Computed property resolving the current widget type active in the builder. */
  readonly currentType = computed(() => this.draftWidget()?.type || 'SQL');
  /** Alias for template usage to match `selectedType()` calls in HTML. */
  readonly selectedType = this.currentType;

  /** Parameter values for template injection. */
  readonly templateParams = signal<Record<string, unknown>>({});
  /** Validity of the parameter form. */
  readonly templateFormValid = signal(true);

  /** Signal model for visual configurations. */
  readonly vizFormModel = signal<{
    title: string;
    subtitle: string;
    xKey: string | null;
    yKey: string | null;
  }>({
    title: '',
    subtitle: '',
    xKey: null,
    yKey: null,
  });

  /** Canonical list of supported visualizations. */
  readonly visualizations: VisualizationOption[] = CANONICAL_VISUALIZATIONS;

  /** Final compiled SQL string. */
  readonly finalSql = signal('');
  /** Latest single-query execution result. */
  readonly executionResult = signal<{
    error?: string;
    columns?: string[];
    data?: Record<string, unknown>[];
  } | null>(null);

  /** Active Tab Index. */
  readonly selectedTab = signal(0);

  /** Whether to show axis config options. */
  readonly showAxesConfig = computed(() => {
    if (this.draftWidget()?.type === 'TEXT') return false;
    const viz = this.draftWidget()?.visualization;
    return ['bar_chart', 'pie_chart', 'line_chart', 'pie', 'line_graph'].includes(viz || '');
  });

  /** Whether visualization is Pie chart. */
  readonly isPie = computed(() => {
    const viz = this.draftWidget()?.visualization;
    return viz === 'pie_chart' || viz === 'pie';
  });

  /** Available columns from single-query preview execution or dashboard store dataMap. */
  readonly availableColumns = computed(() => {
    const previewCols = this.executionResult()?.columns;
    if (previewCols && previewCols.length > 0) {
      return previewCols;
    }
    const id = this.draftWidgetId();
    if (!id) return [];
    return extractWidgetColumns(this.dashboardStore.dataMap()[id]);
  });

  /** Whether data config step is valid. */
  readonly dataConfigured = computed(() => {
    return this.activeMode() === 'template' ? this.templateFormValid() : true;
  });

  /** Strongly typed computed table dataset derived from `executionResult`. */
  readonly previewTableData = computed(() => {
    const res = this.executionResult();
    return {
      columns: res?.columns ?? [],
      data: res?.data ?? [],
    };
  });

  /**
   * Computed widget snapshot merging the active `draftWidget` with live `vizFormModel`
   * title and axis column mappings (`xKey`, `yKey`) without side-effect mutations.
   */
  readonly previewWidget = computed<WidgetResponse | null>(() => {
    const w = this.draftWidget();
    if (!w) {
      return null;
    }
    const formVal = this.vizFormModel();
    const extraSqlConfig: Record<string, unknown> = {};
    if (w.type === 'SQL' && (this.allowNaturalText() || this.selectedProcessor() !== 'SQL')) {
      extraSqlConfig['allow_natural_text'] = this.allowNaturalText();
      extraSqlConfig['processor'] = this.selectedProcessor();
      if (this.naturalTextPrompt().trim()) {
        extraSqlConfig['natural_text_prompt'] = this.naturalTextPrompt().trim();
      }
      if (this.placeholderText().trim()) {
        extraSqlConfig['placeholder_text'] = this.placeholderText().trim();
      }
    }
    const trimmedSubtitle = formVal.subtitle.trim();
    const mergedConfig: Record<string, unknown> = {
      ...w.config,
      xKey: formVal.xKey,
      yKey: formVal.yKey,
      ...extraSqlConfig,
    };
    if (trimmedSubtitle) {
      mergedConfig['subtitle'] = trimmedSubtitle;
    } else if ('subtitle' in mergedConfig && formVal.subtitle === '') {
      delete mergedConfig['subtitle'];
    }
    return {
      ...w,
      title: formVal.title || w.title,
      ...(trimmedSubtitle ? { subtitle: trimmedSubtitle } : {}),
      config: mergedConfig,
    };
  });

  /**
   * Initializes the reactive `searchQuery` signal pipeline with debounce and `takeUntilDestroyed`.
   */
  constructor() {
    merge(toObservable(this.searchQuery).pipe(skip(1)), this.searchInput$)
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((q) => this.loadTemplates(q));
  }

  /**
   * Loads widget templates from the backend API filtered by category and search query.
   *
   * @param search - Optional search query string.
   */
  loadTemplates(search?: string): void {
    this.loadingTemplates.set(true);
    this.templatesApi
      .listTemplatesApiV1TemplatesGet(this.selectedCategory() || undefined, search)
      .pipe(
        finalize(() => this.loadingTemplates.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((t) => this.templates.set(t));
  }

  /**
   * Updates the `searchQuery` signal to trigger a debounced template search.
   *
   * @param query - Search query string.
   */
  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
    this.searchInput$.next(query);
  }

  /**
   * Toggles the active template category filter and reloads templates.
   *
   * @param cat - The category name to toggle.
   */
  toggleCategory(cat: string): void {
    this.selectedCategory.update((c) => (c === cat ? null : cat));
    this.loadTemplates();
  }

  /**
   * Selects a widget template and switches the builder into template mode.
   *
   * @param t - The selected template response object.
   */
  selectTemplate(t: TemplateResponse): void {
    this.selectedTemplate.set(t);
    this.activeMode.set('template');
    this.selectedCustomType.set(null);
  }

  /**
   * Selects a custom widget data source type and switches the builder into custom mode.
   *
   * @param type - The custom widget type ('SQL', 'HTTP', or 'TEXT').
   */
  selectCustomType(type: 'SQL' | 'HTTP' | 'TEXT'): void {
    this.selectedCustomType.set(type);
    this.activeMode.set('custom');
    this.selectedTemplate.set(null);
  }

  /** Validates parameters based on mode. */
  parseParams(): void {
    if (this.activeMode() !== 'template') {
      this.templateParams.set({});
      this.templateFormValid.set(true);
    }
  }

  /**
   * Initializes the draft widget in client memory (without creating orphan DB records on step 1)
   * and advances the wizard stepper.
   *
   * @param dashboardId - Active dashboard UUID.
   * @param stepper - Optional Material stepper instance to advance.
   */
  initializeDraft(dashboardId: string, stepper?: Pick<MatStepper, 'next'>): void {
    let title = $localize`New Widget`;
    let type: 'SQL' | 'HTTP' | 'TEXT' = this.selectedCustomType() || 'SQL';
    let config: Record<string, unknown> = {};
    let visualization = 'table';

    const selectedTemplate = this.selectedTemplate();
    let subtitle = '';
    if (selectedTemplate) {
      title = selectedTemplate.title;
      subtitle = selectedTemplate.description?.trim() ?? '';
      type = 'SQL';
      config = {
        query: selectedTemplate.sql_template,
        ...(subtitle ? { subtitle, description: subtitle } : {}),
      };
    } else if (type === 'SQL') {
      config = { query: 'SELECT * FROM hospital_data LIMIT 5' };
    } else if (type === 'HTTP') {
      config = { url: 'https://example.com', method: 'GET' };
      visualization = 'metric';
    } else {
      config = {
        content: $localize`### New Text Widget
Edit this content.`,
      };
      visualization = 'markdown';
      title = $localize`Text Block`;
    }

    const inMemoryDraft: WidgetResponse = {
      id: LOCAL_DRAFT_WIDGET_ID,
      dashboard_id: dashboardId,
      title,
      ...(subtitle ? { subtitle } : {}),
      type,
      visualization,
      config,
    };

    this.draftWidget.set(inMemoryDraft);
    this.vizFormModel.update((m) => ({
      ...m,
      title: inMemoryDraft.title,
      subtitle,
    }));
    if (stepper) {
      stepper.next();
    }
  }

  /**
   * Compiles template SQL with parameters and executes a single-query preview via `/api/v1/ai/execute`.
   */
  renderPreview(): void {
    const t = this.selectedTemplate();
    if (!t) return;

    const sql = interpolateSqlTemplate(t.sql_template, this.templateParams());
    this.finalSql.set(sql);
    this.executeDraft(sql);
  }

  /**
   * Executes a single-query SQL preview against `/api/v1/ai/execute` without re-executing
   * all widgets on the dashboard.
   *
   * @param sql - The compiled SQL query string to preview.
   */
  executeDraft(sql: string): void {
    const draft = this.draftWidget();
    if (!draft) return;

    this.draftWidget.set({ ...draft, config: { ...draft.config, query: sql } });
    this.isBusy.set(true);
    this.aiApi
      .executeSqlPreviewApiV1AiExecutePost({ sql })
      .pipe(
        finalize(() => this.isBusy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (res) => {
          this.executionResult.set({
            columns: res.columns,
            data: res.data,
            ...(res.error ? { error: res.error } : {}),
          });
        },
        error: () => this.isBusy.set(false),
      });
  }

  /**
   * Injects template parameters into the SQL template, runs a single-query preview, and advances the stepper.
   *
   * @param stepper - Material stepper instance to advance once the query executes.
   */
  runTemplateQuery(stepper: Pick<MatStepper, 'next'>): void {
    const w = this.draftWidget();
    const t = this.selectedTemplate();
    if (!w || !t) return;

    const sql = interpolateSqlTemplate(t.sql_template, this.templateParams());
    this.draftWidget.set({ ...w, config: { ...w.config, query: sql } });
    this.isBusy.set(true);
    this.aiApi
      .executeSqlPreviewApiV1AiExecutePost({ sql })
      .pipe(
        finalize(() => this.isBusy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (res) => {
          this.executionResult.set({
            columns: res.columns,
            data: res.data,
            ...(res.error ? { error: res.error } : {}),
          });
          stepper.next();
        },
        error: () => this.isBusy.set(false),
      });
  }

  /**
   * Validates or refreshes the draft widget's data and advances the stepper to the visualization step.
   *
   * @param stepper - Material stepper instance to advance.
   */
  validateDataPresence(stepper: Pick<MatStepper, 'next'>): void {
    const w = this.draftWidget();
    if (w) {
      if (w.id !== LOCAL_DRAFT_WIDGET_ID) {
        this.dashboardStore.refreshWidget(w.id);
      } else if (w.type === 'SQL' && typeof w.config['query'] === 'string') {
        this.executeDraft(w.config['query']);
      }
    }
    stepper.next();
  }

  /**
   * Persists the configured widget to the backend (creating a new widget if in-memory draft,
   * or updating an existing persisted widget) and invokes `onSaved` on success.
   *
   * @param dashboardId - Target dashboard UUID.
   * @param onSaved - Callback invoked after successful persistence.
   */
  saveAndClose(dashboardId: string, onSaved: () => void): void {
    const w = this.previewWidget();
    if (!w) return;

    this.isBusy.set(true);
    const resolvedTitle = this.vizFormModel().title || w.title;
    const resolvedSubtitle = this.vizFormModel().subtitle.trim() || null;

    if (w.id === LOCAL_DRAFT_WIDGET_ID) {
      let payload: WidgetIn;
      if (w.type === 'HTTP') {
        payload = {
          title: resolvedTitle,
          subtitle: resolvedSubtitle,
          type: 'HTTP',
          visualization: w.visualization,
          config: buildHttpWidgetConfig(w.config),
        };
      } else if (w.type === 'TEXT') {
        payload = {
          title: resolvedTitle,
          subtitle: resolvedSubtitle,
          type: 'TEXT',
          visualization: 'markdown',
          config: buildTextWidgetConfig(w.config),
        };
      } else {
        payload = {
          title: resolvedTitle,
          subtitle: resolvedSubtitle,
          type: 'SQL',
          visualization: w.visualization,
          config: buildSqlWidgetConfig(w.config),
        };
      }

      this.dashboardApi
        .createWidgetApiV1DashboardsDashboardIdWidgetsPost(dashboardId, payload)
        .pipe(
          finalize(() => this.isBusy.set(false)),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe({
          next: () => {
            this.draftWidget.set(null);
            onSaved();
          },
          error: (e: unknown) => this.logger.error('Failed to save widget', e),
        });
      return;
    }

    const update: WidgetUpdate = {
      title: resolvedTitle,
      visualization: w.visualization,
      config: w.config,
    };

    this.dashboardApi
      .updateWidgetApiV1DashboardsWidgetsWidgetIdPut(w.id, update)
      .pipe(
        finalize(() => this.isBusy.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.draftWidget.set(null);
          onSaved();
        },
        error: (e: unknown) => this.logger.error('Failed to save widget', e),
      });
  }

  /**
   * Discards the current draft widget (deleting on the server only if a pre-existing server ID was loaded).
   */
  cancelDraft(): void {
    const id = this.draftWidgetId();
    if (id && id !== LOCAL_DRAFT_WIDGET_ID) {
      this.dashboardApi
        .deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe();
    }
    this.draftWidget.set(null);
  }
}
