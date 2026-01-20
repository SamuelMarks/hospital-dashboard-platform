import { Component, input, ChangeDetectionStrategy, computed } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 

export type SkeletonVariant = 'card' | 'table' | 'chart' | 'metric' | 'pie'; 

/** 
 * Skeleton Loader Component. 
 */ 
@Component({ 
  selector: 'app-skeleton-loader', 
  standalone: true, 
  imports: [CommonModule], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { 
      display: block; width: 100%; height: 100%; overflow: hidden; 
    } 
    .skeleton-box { 
      background-color: var(--sys-surface-border, #f0f0f0); 
      position: relative; overflow: hidden; border-radius: 4px; 
    } 
    .skeleton-box::after { 
      content: ""; position: absolute; top: 0; right: 0; bottom: 0; left: 0; 
      transform: translateX(-100%); 
      background-image: linear-gradient(90deg, rgba(255,255,255,0) 0, rgba(255,255,255,0.4) 20%, rgba(255,255,255,0.7) 60%, rgba(255,255,255,0)); 
      animation: shimmer 1.5s infinite; 
    } 
    @keyframes shimmer { 100% { transform: translateX(100%); } } 

    /* Layouts */ 
    .layout-card { height: 100%; display: flex; flex-direction: column; padding: 16px; gap: 16px; border: 1px solid var(--sys-surface-border); border-radius: 8px; background: var(--sys-surface); } 
    .layout-metric { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; } 
    .metric-val { height: 48px; width: 60%; } 
    .metric-lbl { height: 16px; width: 40%; } 
    .layout-chart { height: 100%; display: flex; flex-direction: column; gap: 8px; padding: 8px; } 
    .chart-area { flex: 1; width: 100%; } 
    .chart-axis { height: 2px; width: 100%; } 
    .layout-table { display: flex; flex-direction: column; gap: 12px; padding: 8px; } 
    .table-head { height: 32px; width: 100%; } 
    .table-row  { height: 24px; width: 100%; } 
    
    /* Pie Variant */ 
    .layout-pie { height: 100%; display: flex; align-items: center; justify-content: center; } 
    .pie-circle { width: 150px; height: 150px; border-radius: 50%; } 
  `], 
  template: `
    @switch (variant()) { 
      @case ('metric') { 
        <div class="layout-metric">
          <div class="skeleton-box metric-val"></div>
          <div class="skeleton-box metric-lbl"></div>
        </div>
      } 
      @case ('chart') { 
        <div class="layout-chart">
          <div class="skeleton-box chart-area"></div>
          <div class="skeleton-box chart-axis"></div>
        </div>
      } 
      @case ('table') { 
        <div class="layout-table">
          <div class="skeleton-box table-head"></div>
          @for (i of [1,2,3,4]; track i) { 
            <div class="skeleton-box table-row" [style.opacity]="1 - (i * 0.15)"></div>
          } 
        </div>
      } 
      @case ('pie') { 
        <div class="layout-pie">
          <div class="skeleton-box pie-circle"></div>
        </div>
      } 
      @default { 
        <div class="layout-card">
          <div class="skeleton-box" style="height: 24px; width: 50%;"></div>
          <div class="skeleton-box" style="flex: 1; width: 100%;"></div>
        </div>
      } 
    } 
  `
}) 
export class SkeletonLoaderComponent { 
  readonly variant = input<SkeletonVariant>('card'); 
}