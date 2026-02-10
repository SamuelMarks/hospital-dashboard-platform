/** 
 * @fileoverview Empty State & Onboarding Component. 
 * 
 * **Updates**: 
 * - Standardization: Uses `MatCard` for option containers. 
 * - Interactivity: Adds `MatRipple` for tactile feedback. 
 * - Accessibility: Added `aria-label` and `role="button"` to cards to support E2E tests and Screen Readers.
 */ 

import { Component, ChangeDetectionStrategy, inject } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { MatCardModule } from '@angular/material/card'; 
import { MatButtonModule } from '@angular/material/button'; 
import { MatIconModule } from '@angular/material/icon'; 
import { MatDialog } from '@angular/material/dialog'; 
import { MatRippleModule } from '@angular/material/core'; 

import { DashboardStore } from '../dashboard.store'; 
import { AskDataService } from '../../global/ask-data.service'; 
import { WidgetBuilderComponent } from '../widget-builder/widget-builder.component'; 

/** Empty State component. */
@Component({ 
  selector: 'app-empty-state', 
  imports: [ 
    CommonModule, 
    MatCardModule, 
    MatButtonModule, 
    MatIconModule, 
    MatRippleModule
  ], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { 
      display: flex; flex-direction: column; align-items: center; justify-content: center; 
      height: 100%; min-height: 400px; padding: 48px; background-color: var(--sys-background); 
    } 

    .hero-text { text-align: center; margin-bottom: 48px; } 
    .hero-title { font-size: 2rem; font-weight: 300; color: var(--sys-text-primary); margin-bottom: 8px; } 
    .hero-subtitle { font-size: 1rem; color: var(--sys-text-secondary); max-width: 600px; margin: 0 auto; } 

    .cards-grid { 
      display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); 
      gap: 24px; width: 100%; max-width: 1000px; 
    } 

    /* Standard M3 Card styling with Ripple capability */ 
    mat-card { 
      cursor: pointer; position: relative; overflow: hidden; height: 100%; 
      transition: transform 0.2s, border-color 0.2s; 
      background-color: var(--sys-surface); 
    } 
    mat-card:hover { 
      transform: translateY(-4px); border-color: var(--sys-primary); 
    } 
    
    .card-content-wrapper { padding: 24px; display: flex; flex-direction: column; height: 100%; } 

    .card-icon-bg { 
      width: 48px; height: 48px; border-radius: 12px; display: flex; 
      align-items: center; justify-content: center; margin-bottom: 16px; 
    } 
    .icon-wizard { background-color: var(--sys-primary-container); color: var(--sys-on-primary-container); } 
    .icon-ai { background-color: var(--sys-tertiary-container); color: var(--sys-on-tertiary-container); } 
    .icon-seed { background-color: var(--sys-secondary-container); color: var(--sys-on-secondary-container); } 

    .card-title { font-size: 1.1rem; font-weight: 500; color: var(--sys-text-primary); margin-bottom: 8px; } 
    .card-desc { font-size: 0.875rem; color: var(--sys-text-secondary); line-height: 1.5; margin-bottom: 24px; flex-grow: 1; } 
    .card-action { margin-top: auto; width: 100%; text-align: right; } 
    
    /* Using fake-button spans to hint interactivity without nesting buttons */ 
    .fake-button { font-weight: 500; font-size: 14px; text-transform: uppercase; color: var(--sys-primary); } 
  `], 
    templateUrl: './empty-state.component.html'
}) 
export class EmptyStateComponent { 
  /** Store. */
  readonly store = inject(DashboardStore); 
    /** dialog property. */
private readonly dialog = inject(MatDialog); 
    /** askDataService property. */
private readonly askDataService = inject(AskDataService); 

  /** Open Wizard. */
  openWizard(): void { 
    const dashboard = this.store.dashboard(); 
    if (!dashboard) return; 

    if (!this.store.isEditMode()) { 
      this.store.toggleEditMode(); 
    } 

    const ref = this.dialog.open(WidgetBuilderComponent, { 
      data: { dashboardId: dashboard.id }, 
      width: '1200px', maxWidth: '95vw', height: '90vh', 
      panelClass: 'no-padding-dialog', disableClose: true
    }); 

    ref.afterClosed().subscribe((res: boolean) => { 
      if (res) this.store.loadDashboard(dashboard.id); 
    }); 
  } 

  /** Open Ai. */
  openAi(): void { 
    this.askDataService.open(); 
  } 

  /** Loads samples. */
  loadSamples(): void { 
    if (this.store.isLoading()) return; 
    this.store.createDefaultDashboard(); 
  } 
}