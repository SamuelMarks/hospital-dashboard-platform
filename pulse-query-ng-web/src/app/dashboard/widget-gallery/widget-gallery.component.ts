/**
 * @fileoverview Sidebar widget gallery component displaying searchable, categorized
 * analytical templates that can be dragged onto a dashboard.
 */
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';

import { TemplatesService, TemplateResponse } from '../../api-client';
import { extractEventInputValue } from '../../shared/utils/dom-event.utils';
import {
  SkeletonLoaderComponent,
  SkeletonVariant,
} from '../../shared/components/skeleton-loader.component';
import { TemplateConfigurationService } from '../template-configuration.service';

/**
 * Displays a searchable gallery of widget templates grouped by clinical category.
 */
@Component({
  selector: 'app-widget-gallery',
  imports: [
    DragDropModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatExpansionModule,
    SkeletonLoaderComponent,
  ],

  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        /* Sidebar background */
        background: var(--sys-surface);
        border-left: 1px solid var(--sys-surface-border);
        width: 100%;
        flex: 1 1 auto;
        overflow: hidden;
      }
      .header {
        padding: 16px;
        border-bottom: 1px solid var(--sys-surface-border);
        background: var(--sys-surface);
        color: var(--sys-text-primary);
      }
      .grid-container {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .template-card {
        cursor: grab;
        border: 1px solid var(--sys-surface-border);
        padding: 12px;
        border-radius: 8px;
        /* Fix: Use dynamic color, not white */
        background: var(--sys-background);
        transition:
          box-shadow 0.2s,
          border-color 0.2s;
        color: var(--sys-text-primary);
      }
      .template-card:hover {
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        border-color: var(--sys-primary);
        background: var(--sys-surface-variant);
      }
      .template-card:active {
        cursor: grabbing;
      }
      /* Material Drag Preview */
      .cdk-drag-preview {
        box-sizing: border-box;
        border-radius: 8px;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
        /* Drag preview styling */
        background: var(--sys-surface);
        border: 1px solid var(--sys-primary);
        color: var(--sys-text-primary);
        padding: 12px;
        width: 300px;
        z-index: 10000;
      }
      .cat-header {
        font-size: 11px;
        color: var(--sys-text-secondary);
        text-transform: uppercase;
        font-weight: 700;
        margin-top: 8px;
        margin-bottom: 4px;
      }

      /* Ensure input/icons inherit color correctly in dark mode */
      .text-primary {
        color: var(--sys-primary);
      }
      .text-gray-500 {
        color: var(--sys-text-secondary);
      }
      .gallery-drop-silhouette {
        grid-column: span 6;
        min-height: 260px;
        height: 100%;
        width: 100%;
        border: 2px dashed var(--sys-primary);
        border-radius: 10px;
        background: color-mix(in srgb, var(--sys-primary) 8%, var(--sys-surface));
        padding: 14px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .silhouette-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .silhouette-title {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--sys-primary);
      }
      .silhouette-badge {
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        padding: 2px 8px;
        border-radius: 999px;
        background-color: var(--sys-primary-container);
        color: var(--sys-on-primary-container);
      }
      .silhouette-subtitle {
        font-size: 0.75rem;
        color: var(--sys-text-secondary);
      }
      .silhouette-body {
        flex: 1;
        min-height: 160px;
        opacity: 0.85;
      }
    `,
  ],
  templateUrl: './widget-gallery.component.html',
})
export class WidgetGalleryComponent implements OnInit {
  /**
   * Extracts the string value from a DOM input event.
   *
   * @param event - The DOM input event.
   * @returns Current string value of the target HTMLInputElement.
   */
  getEventValue(event: Event): string {
    return extractEventInputValue(event);
  }

  /** Backend templates API service. */
  private readonly templatesApi = inject(TemplatesService);
  /** Shared template configuration service for inferring visualization types. */
  private readonly templateConfig = inject(TemplateConfigurationService);
  /** Full list of templates loaded from the backend. */
  readonly templates = signal<TemplateResponse[]>([]);
  /** Whether templates are currently loading from the server. */
  readonly loading = signal(true);
  /** Current search query string used to filter templates. */
  readonly searchQuery = signal('');

  /**
   * Infers the skeleton variant (`'table'`, `'chart'`, `'metric'`, or `'pie'`) for a template's drag silhouette.
   *
   * @param template - Template being dragged.
   * @returns Matching `SkeletonVariant` for the silhouette preview.
   */
  getTemplateSkeletonVariant(template: TemplateResponse): SkeletonVariant {
    const viz = this.templateConfig.inferVisualization(template);
    if (viz === 'pie') return 'pie';
    if (viz.includes('chart')) return 'chart';
    if (viz === 'metric' || viz === 'scalar') return 'metric';
    return 'table';
  }

  /**
   * Computes the target grid row span (`h`) for a template's drag silhouette on the dashboard grid.
   *
   * @param template - Template being dragged.
   * @returns Grid row span (`4`, `5`, or `6`).
   */
  getTemplateRowSpan(template: TemplateResponse): number {
    const viz = this.templateConfig.inferVisualization(template);
    if (viz === 'table') return 6;
    if (viz === 'bar_chart' || viz === 'pie') return 5;
    return 4;
  }

  /** Loads available widget templates when the gallery initializes. */
  ngOnInit(): void {
    this.loadTemplates();
  }

  /** Fetches up to 100 widget templates from the backend API. */
  loadTemplates(): void {
    this.loading.set(true);
    this.templatesApi.listTemplatesApiV1TemplatesGet(undefined, undefined, 100).subscribe({
      next: (data) => {
        this.templates.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Templates filtered by matching the search query against title or description. */
  readonly filteredTemplates = computed(() => {
    const q = this.searchQuery().toLowerCase();
    return this.templates().filter(
      (t) =>
        !q || t.title.toLowerCase().includes(q) || (t.description?.toLowerCase() || '').includes(q),
    );
  });

  /** Filtered templates grouped and sorted alphabetically by category name. */
  readonly groupedTemplates = computed(() => {
    const list = this.filteredTemplates();
    const groups: Record<string, TemplateResponse[]> = {};

    list.forEach((t) => {
      const cat = t.category || $localize`General`;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    });

    return Object.keys(groups)
      .sort()
      .map((cat) => ({
        category: cat,
        items: groups[cat],
      }));
  });
}
