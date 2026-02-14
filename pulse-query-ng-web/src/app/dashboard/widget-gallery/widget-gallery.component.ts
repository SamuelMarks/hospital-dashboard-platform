import {
  Component,
  OnInit,
  inject,
  signal,
  ChangeDetectionStrategy,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';

// Material
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';

import { TemplatesService, TemplateResponse } from '../../api-client';

/** Widget Gallery component. */
@Component({
  selector: 'app-widget-gallery',
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatExpansionModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--sys-surface);
        border-left: 1px solid var(--sys-surface-border);
        width: 100%;
        flex: 1 1 auto;
        overflow: hidden;
      }
      .header {
        padding: 16px;
        border-bottom: 1px solid var(--sys-surface-border);
        background: var(--sys-background);
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
        background: white;
        transition: box-shadow 0.2s;
      }
      .template-card:hover {
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        border-color: var(--sys-primary);
      }
      .template-card:active {
        cursor: grabbing;
      }
      /* Material Drag Preview */
      .cdk-drag-preview {
        box-sizing: border-box;
        border-radius: 8px;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
        background: white;
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
    `,
  ],
  templateUrl: './widget-gallery.component.html',
})
export class WidgetGalleryComponent implements OnInit {
  /** templatesApi property. */
  private readonly templatesApi = inject(TemplatesService);

  /** Templates. */
  /* istanbul ignore next */
  readonly templates = signal<TemplateResponse[]>([]);
  /** Loading. */
  /* istanbul ignore next */
  readonly loading = signal(true);

  // Mutable Search Model
  /** Search Query. */
  /* istanbul ignore next */
  readonly searchQuery = signal('');

  /** Ng On Init. */
  ngOnInit() {
    this.loadTemplates();
  }

  /** Loads templates. */
  loadTemplates() {
    this.loading.set(true);
    this.templatesApi.listTemplatesApiV1TemplatesGet(undefined, undefined, 100).subscribe({
      next: (data) => {
        this.templates.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Filtered Templates. */
  /* istanbul ignore next */
  readonly filteredTemplates = computed(() => {
    const q = this.searchQuery().toLowerCase();
    return this.templates().filter(
      (t) =>
        !q || t.title.toLowerCase().includes(q) || (t.description?.toLowerCase() || '').includes(q),
    );
  });

  /** Grouped Templates. */
  /* istanbul ignore next */
  readonly groupedTemplates = computed(() => {
    const list = this.filteredTemplates();
    const groups: Record<string, TemplateResponse[]> = {};

    list.forEach((t) => {
      const cat = t.category || 'General';
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
