// ... (imports same as before)
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
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';

import { TemplatesService, TemplateResponse } from '../../api-client';

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
    `,
  ],
  templateUrl: './widget-gallery.component.html',
})
export class WidgetGalleryComponent implements OnInit {
  // ... (Component logic identical to previous version)
  private readonly templatesApi = inject(TemplatesService);
  readonly templates = signal<TemplateResponse[]>([]);
  readonly loading = signal(true);
  readonly searchQuery = signal('');

  ngOnInit() {
    this.loadTemplates();
  }

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

  readonly filteredTemplates = computed(() => {
    const q = this.searchQuery().toLowerCase();
    return this.templates().filter(
      (t) =>
        !q || t.title.toLowerCase().includes(q) || (t.description?.toLowerCase() || '').includes(q),
    );
  });

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
