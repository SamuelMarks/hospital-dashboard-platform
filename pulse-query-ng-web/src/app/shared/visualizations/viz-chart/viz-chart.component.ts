import { 
  Component, 
  input, 
  computed, 
  ChangeDetectionStrategy, 
  inject, 
  effect, 
  signal, 
  PLATFORM_ID 
} from '@angular/core'; 
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common'; 
import { TableDataSet } from '../viz-table/viz-table.component'; 
import { ThemeService } from '../../../core/theme/theme.service'; 

/** 
 * Configuration for reference lines (e.g. thresholds). 
 */ 
export interface ChartReferenceLine { 
  y: number; 
  label?: string; 
  color?: string; 
  style?: 'solid' | 'dashed' | 'dotted'; 
} 

/** 
 * Configuration schema passed from parent widgets. 
 */ 
export interface ChartConfig { 
    xKey?: string; 
    yKey?: string; 
    stackBy?: string; 
    referenceLines?: ChartReferenceLine[]; 
} 

/** 
 * Internal representation for chart rendering logic. 
 */ 
interface ChartItem { 
  segments?: { 
    label: string; 
    value: number; 
    color: string; 
    heightPct: string; 
    bottomPct: string; 
  }[]; 
  label: string; 
  value: number; 
  heightPct: string; 
  bottomPct: string; 
  isNegative: boolean; 
  isStacked: boolean; 
} 

/** 
 * Visualization: Bar/Column Chart. 
 * 
 * **Updates**: 
 * - Consumes Runtime CSS Variables for chart colors via `ThemeService`. 
 * - Reacts to theme changes instantly without reloading. 
 */ 
@Component({ 
  selector: 'viz-chart', 
  imports: [CommonModule], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { display: block; height: 100%; width: 100%; padding: 16px; } 
    .wrapper { display: flex; flex-direction: column; height: 100%; } 
    .header { display: flex; justify-content: space-between; color: var(--sys-text-secondary); font-size: 10px; font-weight: 500; text-transform: uppercase; margin-bottom: 8px; } 
    .plot-area { flex-grow: 1; position: relative; border-left: 1px solid var(--sys-surface-border); min-height: 100px; margin-left: 8px; } 
    .bars-container { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: space-between; gap: 4px; z-index: 10; padding-bottom: 1px; } 
    .col-wrapper { flex: 1; height: 100%; position: relative; } 

    .bar-segment { position: absolute; width: 100%; transition: height 0.3s, bottom 0.3s; } 
    .col-wrapper:hover .bar-segment { opacity: 0.9; } 

    .bar { position: absolute; width: 100%; border-radius: 2px 2px 0 0; transition: all 0.3s; } 
    /* Default fallback colors if JS palette not loaded yet */ 
    .bar-pos { background-color: var(--chart-color-1, #1976d2); } 
    .bar-neg { background-color: var(--chart-neg, #f44336); } 
    .col-wrapper:hover .bar { opacity: 0.8; } 

    .x-axis { margin-top: 4px; margin-left: 8px; height: 24px; border-top: 1px solid var(--sys-surface-border); display: flex; justify-content: space-between; gap: 4px; } 
    .x-label { flex: 1; text-align: center; font-size: 10px; color: var(--sys-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-top: 4px; } 

    .tooltip { 
      visibility: hidden; position: absolute; left: 50%; transform: translateX(-50%); bottom: 100%; 
      background: var(--sys-surface-border); color: var(--sys-text-primary); padding: 4px 8px; 
      border-radius: 4px; font-size: 10px; white-space: pre; z-index: 20; 
      box-shadow: 0 2px 4px rgba(0,0,0,0.2); border: 1px solid var(--sys-text-secondary); pointer-events: none; 
    } 
    .col-wrapper:hover .tooltip { visibility: visible; } 
  `], 
  template: `
    <div class="wrapper">
      <div class="header">
         <span>{{ axisKeys().y }}</span>
         <span>{{ axisKeys().x }}</span>
      </div>

      <div class="plot-area">
        <div class="bars-container">
          @for (item of processedData(); track item.label) { 
            <div class="col-wrapper">

               @if (item.isStacked && item.segments) { 
                 @for (seg of item.segments; track seg.label) { 
                   <div
                     class="bar-segment" 
                     [style.background-color]="seg.color" 
                     [style.height]="seg.heightPct" 
                     [style.bottom]="seg.bottomPct" 
                   ></div>
                 } 
                 <div class="tooltip">
                   <strong>{{ item.label }}</strong>
                   @for (seg of item.segments; track seg.label) { 
                     <div>{{ seg.label }}: {{ seg.value }}</div>
                   } 
                 </div>

               } @else { 
                 <!-- Single Bar: Uses CSS Vars or JS Palette -->
                 <div
                   class="bar" 
                   [style.background-color]="item.isNegative ? getPalette(-1) : getPalette(0)" 
                   [style.height]="item.heightPct" 
                   [style.bottom]="item.bottomPct" 
                 ></div>
                 <div class="tooltip" [style.bottom]="item.isNegative ? '-25px' : '100%'">
                   <strong>{{ item.label }}</strong>: {{ item.value }} 
                 </div>
               } 
            </div>
          } @empty { 
             <div class="flex items-center justify-center h-full w-full opacity-50 text-xs">No Data</div>
          } 
        </div>
      </div>

      <div class="x-axis">
         @for (item of processedData(); track item.label) { 
           <div class="x-label" [title]="item.label">{{ item.label }}</div>
         } 
      </div>
    </div>
  `
}) 
export class VizChartComponent { 
  readonly dataSet = input.required<TableDataSet | null>(); 
  readonly config = input<ChartConfig>(); 

  private readonly document = inject(DOCUMENT); 
  private readonly platformId = inject(PLATFORM_ID); 
  private readonly themeService = inject(ThemeService); 

  /** 
   * Reactive Palette Signal. 
   * Stores the resolved hex codes from CSS variables. 
   */ 
  private readonly palette = signal<string[]>([]); 

  constructor() { 
    // Reads CSS variables whenever theme changes 
    effect(() => { 
      // Dependency trigger 
      this.themeService.seedColor(); 
      this.themeService.isDark(); 

      if (isPlatformBrowser(this.platformId)) { 
        // Small delay to allow Paint to settle variables 
        requestAnimationFrame(() => this.updatePaletteFromDom()); 
      } 
    }); 
  } 

  /** 
   * Extracts runtime CSS variables for charting consistency. 
   */ 
  private updatePaletteFromDom(): void { 
    if (!this.document) return; 
    const style = getComputedStyle(this.document.documentElement); 
    
    // We expect these to be populated by ThemeService/ColorUtils 
    const p1 = style.getPropertyValue('--chart-color-1').trim() || '#1976d2'; 
    const p2 = style.getPropertyValue('--chart-color-2').trim() || '#585e71'; 
    const p3 = style.getPropertyValue('--chart-color-3').trim() || '#735471'; 
    const neg = style.getPropertyValue('--chart-neg').trim() || '#ba1a1a'; 

    this.palette.set([p1, p2, p3, '#fbc02d', '#7b1fa2', '#e64a19', '#0288d1', neg]); 
  } 

  /** 
   * Helper to safely access palette by index. 
   * @param {number} index - Index or -1 for negative color. 
   * @returns {string} Hex color. 
   */ 
  getPalette(index: number): string { 
    const colors = this.palette(); 
    if (colors.length === 0) return index === -1 ? '#ba1a1a' : '#1976d2'; 
    if (index === -1) return colors[colors.length - 1]; 
    return colors[index % (colors.length - 1)]; 
  } 

  /** 
   * Determines X and Y keys for plotting. 
   */ 
  readonly axisKeys = computed(() => { 
    const ds = this.dataSet(); 
    const conf = this.config(); 
    if (!ds || !ds.data || ds.data.length === 0) return { x: '', y: '', stack: '' }; 
    const cols = ds.columns || Object.keys(ds.data[0]); 

    let x = conf?.xKey || cols.find(c => typeof ds.data[0][c] === 'string') || cols[0]; 
    let y = conf?.yKey || cols.find(c => typeof ds.data[0][c] === 'number') || cols[1] || cols[0]; 
    let stack = conf?.stackBy || ''; 

    if (!conf?.stackBy && cols.length >= 3) { 
       const potentialStack = cols.find(c => c !== x && typeof ds.data[0][c] === 'string'); 
       if (potentialStack) stack = potentialStack; 
    } 

    return { x, y, stack }; 
  }); 

  /** 
   * Computes the renderable data structure. 
   */ 
  readonly processedData = computed<ChartItem[]>(() => { 
    const ds = this.dataSet(); 
    const { x, y, stack } = this.axisKeys(); 
    
    // Dependency on palette ensures re-computation on theme change 
    this.palette(); 

    if (!ds || !x || !y) return []; 

    if (stack) { 
        return this.processStackedData(ds.data, x, y, stack); 
    } 
    return this.processSimpleData(ds.data, x, y); 
  }); 

  private getRefMax() { 
    return (this.config()?.referenceLines || []).reduce((acc, l) => Math.max(acc, l.y), 0); 
  } 

  /** 
   * Processing Strategy for Standard Bar Charts. 
   */ 
  private processSimpleData(rows: Record<string, any>[], xKey: string, yKey: string): ChartItem[] { 
    const values = rows.map(r => Number(r[yKey]) || 0); 
    const min = Math.min(...values, 0); 
    const max = Math.max(...values, 0, this.getRefMax()); 
    const range = (max - min) || 10; 

    // Calculate where "Zero" sits in percentage terms relative to min 
    const zeroPct = ((0 - min) / range) * 100; 

    return rows.map(row => { 
        const val = Number(row[yKey]) || 0; 
        const isNeg = val < 0; 
        const hPct = (Math.abs(val) / range) * 100; 
        
        // If negative, bottom starts at (zeroPct - height). If positive, starts at zeroPct. 
        const bPct = isNeg ? zeroPct - hPct : zeroPct; 

        return { 
            label: String(row[xKey]), 
            value: val, 
            heightPct: `${hPct}%`, 
            bottomPct: `${bPct}%`, 
            isNegative: isNeg, 
            isStacked: false
        }; 
    }); 
  } 

  /** 
   * Processing Strategy for Stacked Bar Charts. 
   */ 
  private processStackedData(rows: Record<string, any>[], xKey: string, yKey: string, stackKey: string): ChartItem[] { 
    const groups: Record<string, {label: string, val: number, color: string }[]> = {}; 
    const colorMap: Record<string, string> = {}; 
    let ci = 0; 

    rows.forEach(r => { 
        const xVal = String(r[xKey]); 
        const stackVal = String(r[stackKey]); 
        const yVal = Math.max(0, Number(r[yKey]) || 0); 

        if (!groups[xVal]) groups[xVal] = []; 
        if (!colorMap[stackVal]) { 
          // Use dynamic palette logic 
          colorMap[stackVal] = this.getPalette(ci++); 
        } 

        groups[xVal].push({ label: stackVal, val: yVal, color: colorMap[stackVal] }); 
    }); 

    let maxTotal = this.getRefMax(); 
    Object.values(groups).forEach(stackArr => { 
        const total = stackArr.reduce((sum, item) => sum + item.val, 0); 
        if (total > maxTotal) maxTotal = total; 
    }); 
    const scale = maxTotal || 1; 

    return Object.keys(groups).map(xLabel => { 
        const stackArr = groups[xLabel]; 
        let currentBottom = 0; 

        const segments = stackArr.map(seg => { 
            const hPctNum = (seg.val / scale) * 100; 
            const bPctNum = (currentBottom / scale) * 100; 
            const segment = { 
                label: seg.label, value: seg.val, color: seg.color, 
                heightPct: `${hPctNum}%`, bottomPct: `${bPctNum}%`
            }; 
            currentBottom += seg.val; 
            return segment; 
        }); 

        return { 
            label: xLabel, value: currentBottom, 
            heightPct: '', bottomPct: '', isNegative: false, isStacked: true, 
            segments: segments.reverse() 
        }; 
    }); 
  } 
}