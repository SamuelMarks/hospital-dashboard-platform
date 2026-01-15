import { Component, input, computed, ChangeDetectionStrategy, Signal } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { MatTooltipModule } from '@angular/material/tooltip'; 

/** 
 * Visualization: Scalar & Correlation Gauge.
 */ 
@Component({ 
  selector: 'viz-scalar', 
  imports: [CommonModule, MatTooltipModule], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%; padding: 16px; } 
    .value-display { font-size: 3rem; font-weight: 300; color: var(--sys-text-primary); line-height: 1; margin-bottom: 8px; } 
    .label-display { font-size: 0.875rem; text-transform: uppercase; color: var(--sys-text-secondary); letter-spacing: 1px; text-align: center; } 
    .correlation-gauge { width: 100%; max-width: 200px; height: 8px; background: #e0e0e0; border-radius: 4px; position: relative; margin-top: 16px; background: linear-gradient(90deg, #f44336 0%, #e0e0e0 50%, #4caf50 100%); } 
    .indicator { position: absolute; top: -4px; width: 4px; height: 16px; background-color: #333; border: 1px solid white; transform: translateX(-50%); } 
    .interpret-text { margin-top: 8px; font-weight: 500; font-size: 0.75rem; color: var(--sys-text-secondary); } 
  `], 
  template: `
    <div class="value-display" role="status">{{ formattedValue() }}</div>
    <div class="label-display">{{ label() }}</div>

    @if (isCorrelation()) { 
      <div 
        class="correlation-gauge" 
        matTooltip="Correlation Scale: -1 (Neg) to +1 (Pos)"
        role="meter" 
        [attr.aria-valuenow]="value()" 
        aria-valuemin="-1" 
        aria-valuemax="1"
      >
        <div class="indicator" [style.left.%]="gaugePosition()"></div>
      </div>
      <div class="interpret-text" [style.color]="strengthColor()">
        {{ strengthLabel() }} 
      </div>
    } 
  `
}) 
export class VizScalarComponent { 
  readonly data = input<any | null>(); 

  readonly value: Signal<number | null> = computed(() => { 
    const d = this.data(); 
    if (!d) return null; 
    
    if (!Array.isArray(d.data) && typeof d.value === 'number') return d.value; 

    if (Array.isArray(d.data) && d.data.length > 0) { 
      const row = d.data[0]; 
      const valKey = Object.keys(row).find(k => typeof row[k] === 'number'); 
      return valKey ? row[valKey] : null; 
    } 
    return null; 
  }); 

  readonly formattedValue = computed(() => { 
    const v = this.value(); 
    if (v === null) return '-'; 
    if (Math.abs(v) <= 1) return v.toFixed(2); 
    return v.toLocaleString(); 
  }); 

  readonly label = computed(() => { 
    const d = this.data(); 
    if (d?.columns && d.columns.length > 0) return d.columns.find((c: string) => c !== 'value') || d.columns[0]; 
    return 'Result'; 
  }); 

  readonly isCorrelation = computed(() => { 
    const v = this.value(); 
    const l = this.label().toLowerCase(); 
    if (l.includes('correlation') || l.includes('coef') || l.includes('prob') || l.includes('risk')) { 
        return v !== null && v >= -1 && v <= 1; 
    } 
    return false; 
  }); 

  readonly gaugePosition = computed(() => { 
    const v = this.value() || 0; 
    return ((v + 1) / 2) * 100; 
  }); 

  readonly strengthLabel = computed(() => { 
    const v = this.value() || 0; 
    const abs = Math.abs(v); 
    if (abs < 0.3) return 'Weak / No Correlation'; 
    if (abs < 0.7) return 'Moderate Correlation'; 
    return 'Strong Correlation'; 
  }); 

  readonly strengthColor = computed(() => { 
    const v = this.value() || 0; 
    if (Math.abs(v) < 0.3) return 'var(--sys-text-secondary)'; 
    return v > 0 ? '#4caf50' : '#f44336'; 
  }); 
}