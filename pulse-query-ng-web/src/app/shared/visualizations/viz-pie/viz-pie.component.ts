/** 
 * @fileoverview Accessible Pie Chart Component. 
 * 
 * **Updates**: 
 * - Integrated `ThemeService` for dynamic palette generation. 
 * - Uses Document CSS variables for consistent re-theming. 
 */ 

import { 
  Component, 
  input, 
  computed, 
  ChangeDetectionStrategy, 
  signal, 
  Signal, 
  inject, 
  PLATFORM_ID, 
  effect 
} from '@angular/core'; 
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common'; 
import { TableDataSet } from '../viz-table/viz-table.component'; 
import { ChartConfig } from '../viz-chart/viz-chart.component'; 
import { ThemeService } from '../../../core/theme/theme.service'; 

/** Represents a calculated arc segment */ 
interface PieSlice { 
  path: string; 
  color: string; 
  label: string; 
  percentage: number; 
} 

@Component({ 
  selector: 'viz-pie', 
  imports: [CommonModule], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { display: block; width: 100%; height: 100%; } 
    .container { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; } 
    svg { overflow: visible; } 
    path { transition: opacity 0.2s; cursor: pointer; stroke: var(--sys-surface); stroke-width: 0.02; } 
    path:hover, path:focus { opacity: 0.8; stroke: var(--sys-text-primary); outline: none; } 
    
    .tooltip { 
      position: absolute; background: rgba(0,0,0,0.8); color: white; 
      padding: 4px 8px; border-radius: 4px; font-size: 12px; 
      pointer-events: none; opacity: 0; transition: opacity 0.2s; 
    } 
    .container:hover .tooltip { opacity: 1; } 
    
    /* Interactive Legend */ 
    .legend { 
        position: absolute; right: 10px; top: 10px; font-size: 11px; 
        background: var(--sys-surface); padding: 8px; border-radius: 4px; 
        border: 1px solid var(--sys-surface-border); box-shadow: 0 2px 4px rgba(0,0,0,0.1); 
        max-height: 80%; overflow-y: auto; pointer-events: auto; color: var(--sys-text-primary); 
    } 
    .legend-item { 
      display: flex; align-items: center; gap: 6px; margin-bottom: 4px; 
      cursor: pointer; padding: 2px 4px; border-radius: 2px; 
    } 
    .legend-item:hover, .legend-item:focus { background-color: var(--sys-hover); outline: none; } 
    .dot { width: 8px; height: 8px; border-radius: 50%; } 
  `], 
  template: `
    <div class="container" role="figure" [attr.aria-label]="accessibilityLabel()">
      
      <!-- SVG Chart -->
      <svg viewBox="-1 -1 2 2" style="transform: rotate(-90deg)" height="80%" role="img" aria-hidden="true">
        @for (slice of slices(); track slice.label) { 
          <path 
            [attr.d]="slice.path" 
            [attr.fill]="slice.color" 
            (mouseenter)="activeSlice.set(slice.label)" 
            (mouseleave)="activeSlice.set(null)" 
            tabindex="-1" 
          >
             <title>{{slice.label}}: {{slice.percentage}}%</title>
          </path>
        } 
      </svg>
      
      <!-- Keyboard Accessible Legend -->
      <div class="legend" role="list" aria-label="Chart Legend">
        @for (slice of slices(); track slice.label) { 
          <div 
            class="legend-item" 
            role="listitem" 
            [style.opacity]="isActive(slice.label) ? 1 : 0.3" 
            (mouseenter)="activeSlice.set(slice.label)" 
            (mouseleave)="activeSlice.set(null)" 
            (focus)="activeSlice.set(slice.label)" 
            (blur)="activeSlice.set(null)" 
            tabindex="0" 
            [attr.aria-label]="slice.label + ': ' + slice.percentage + ' percent'" 
          >
            <div class="dot" [style.background-color]="slice.color" aria-hidden="true"></div>
            <span>{{slice.label}}</span>
          </div>
        } 
      </div>

      <!-- Center Data Label (Visual Tooltip) -->
      @if (activeSlice()) { 
        <div class="tooltip" style="bottom: 10px;" aria-hidden="true">
          {{ activeSlice() }} 
        </div>
      } 
    </div>
  `
}) 
export class VizPieComponent { 
  readonly dataSet = input.required<TableDataSet | null>(); 
  readonly config = input<ChartConfig>(); 
  
  private readonly document = inject(DOCUMENT); 
  private readonly platformId = inject(PLATFORM_ID); 
  private readonly themeService = inject(ThemeService); 

  readonly activeSlice = signal<string | null>(null); 
  
  private readonly palette = signal<string[]>(['#1976d2', '#42a5f5', '#64b5f6']); 

  constructor() { 
    // Listen to theme resets 
    effect(() => { 
      this.themeService.seedColor(); 
      this.themeService.isDark(); 
      if (isPlatformBrowser(this.platformId)) { 
        requestAnimationFrame(() => this.updatePaletteFomDom()); 
      } 
    }); 
  } 

  private updatePaletteFomDom(): void { 
    if (!this.document) return; 
    const style = getComputedStyle(this.document.documentElement); 
    const p1 = style.getPropertyValue('--chart-color-1').trim(); 
    const p2 = style.getPropertyValue('--chart-color-2').trim(); 
    const p3 = style.getPropertyValue('--chart-color-3').trim(); 
    
    // Provide a gradient of shades if not all distinct 
    this.palette.set([p1, p2, p3, '#ffb74d', '#ffa726', '#f57c00', '#d32f2f', '#c2185b']); 
  } 

  isActive(l: string): boolean { 
    return !this.activeSlice() || this.activeSlice() === l; 
  } 

  readonly accessibilityLabel = computed(() => { 
    const s = this.slices(); 
    return `Pie chart with ${s.length} slices. Use tab to navigate legendary items for details.`; 
  }); 

  readonly slices: Signal<PieSlice[]> = computed(() => { 
    const ds = this.dataSet(); 
    const colors = this.palette(); 

    if (!ds || !ds.data.length || !ds.columns.length) return []; 
    
    // Determine Mapping 
    const conf = this.config(); 
    const availableCols = ds.columns; 
    
    // Default: Col 0 for label, Col 1 for value 
    let labelKey = availableCols[0]; 
    let valueKey = availableCols[1] || availableCols[0]; 

    if (conf?.xKey && availableCols.includes(conf.xKey)) { 
        labelKey = conf.xKey; 
    } 
    if (conf?.yKey && availableCols.includes(conf.yKey)) { 
        valueKey = conf.yKey; 
    } 
    
    const total = ds.data.reduce((acc, r) => acc + Math.max(0, (Number(r[valueKey]) || 0)), 0); 
    let cumPercent = 0; 

    return ds.data.map((row, i) => { 
      const rawVal = Number(row[valueKey]) || 0; 
      const val = Math.max(0, rawVal); 
      const percent = total > 0 ? val / total : 0; 
      
      const start = cumPercent; 
      cumPercent += percent; 
      
      const startX = Math.cos(2 * Math.PI * start); 
      const startY = Math.sin(2 * Math.PI * start); 
      const endX = Math.cos(2 * Math.PI * cumPercent); 
      const endY = Math.sin(2 * Math.PI * cumPercent); 
      
      const largeArc = percent > 0.5 ? 1 : 0; 

      const pathCmd = percent >= 0.999 
        ? `M 1 0 A 1 1 0 1 1 -1 0 A 1 1 0 1 1 1 0` 
        : `M 0 0 L ${startX} ${startY} A 1 1 0 ${largeArc} 1 ${endX} ${endY} Z`; 

      return { 
        label: String(row[labelKey]), 
        percentage: Math.round(percent * 100), 
        color: colors[i % colors.length], 
        path: pathCmd
      } as PieSlice; 
    }); 
  }); 
}