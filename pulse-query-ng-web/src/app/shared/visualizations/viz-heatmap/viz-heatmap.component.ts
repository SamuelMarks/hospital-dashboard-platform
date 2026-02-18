import {
  Component,
  input,
  computed,
  ChangeDetectionStrategy,
  inject,
  PLATFORM_ID,
  effect,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { TableDataSet } from '../viz-table/viz-table.component';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService } from '../../../core/theme/theme.service';

@Component({
  selector: 'viz-heatmap',
  imports: [CommonModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        overflow: auto;
        padding: 16px;
      }
      .heatmap-container {
        display: grid;
        gap: 2px;
        align-items: stretch;
        justify-items: stretch;
      }
      .cell {
        position: relative;
        width: 100%;
        min-width: 30px;
        height: 30px;
        border-radius: 2px;
        transition: border 0.1s;
      }
      .cell:hover {
        border: 1px solid var(--sys-on-surface);
        z-index: 10;
      }
      /* ... labels / legend styles ... */
      .legend-bar {
        width: 100px;
        height: 8px;
        background: linear-gradient(to right, var(--sys-surface-variant), var(--sys-error));
        border-radius: 4px;
      }
    `,
  ],
  templateUrl: './viz-heatmap.component.html',
})
export class VizHeatmapComponent {
  readonly dataSet = input.required<TableDataSet | null>();

  // Inject theme service to determine base color logic if needed,
  // though using CSS variables with opacity is generally robust.

  readonly matrix = computed(() => {
    // ... logic remains identical ...
    const ds = this.dataSet();
    if (!ds || ds.data.length === 0) return null;
    // ...
    // Note: Re-include data processing logic from previous valid file
    const cols = ds.columns;
    const yKey = cols[0];
    const xKey = cols[1];
    const valKey = cols[2];

    const xSet = new Set<string>();
    const ySet = new Set<string>();
    const dataMap = new Map<string, number>();
    let min = 0,
      max = 0;

    ds.data.forEach((row) => {
      const x = String(row[xKey]);
      const y = String(row[yKey]);
      const val = Number(row[valKey]) || 0;
      xSet.add(x);
      ySet.add(y);
      dataMap.set(`${x}:${y}`, val);
      if (val < min) min = val;
      if (val > max) max = val;
    });

    const xHeaders = Array.from(xSet).sort((a, b) => Number(a) - Number(b));
    const yHeaders = Array.from(ySet).sort();
    return { xHeaders, yHeaders, dataMap, min, max };
  });

  getCellColor(m: any, x: string, y: string): string {
    const val = m.dataMap.get(`${x}:${y}`) || 0;
    const range = m.max - m.min || 1;
    const pct = (val - m.min) / range;

    // USE CSS VARIABLE FOR COLOR + Opacity
    // This allows the color to shift from standard Red (Light) to Pastel Red (Dark) automatically if defined.
    // Falls back to hardcoded hex if var not found.
    // We use a CSS var trick: We can't access var() in JS easily without getComputedStyle.
    // Instead, we return an rgba using standard values, or rely on `style.opacity`.

    // Better Approach for Angular:
    // Return a style object or CSS custom property for opacity.

    // However, to keep it simple and performant:
    // Dark Mode Red: #cf6679 (Error Container or Error)
    // Light Mode Red: #b00020

    // We will return a dynamic string that uses the CSS variable syntax directly.
    // Browsers support `color-mix` now, but for broad support we assume a base color.
    // We'll use the --sys-error variable and modify opacity.

    // BUT: "background-color: var(--sys-error)" with opacity needs `color-mix` or `rgba`.
    // Since we don't have the RGB components of the var, we use `color-mix`.

    return `color-mix(in srgb, var(--sys-error), var(--sys-surface-variant) ${100 - pct * 100}%)`;
  }

  getCellTooltip(m: any, x: string, y: string): string {
    const val = m.dataMap.get(`${x}:${y}`) || 0;
    return `${y} @ Hour ${x}: ${val}`;
  }
}
