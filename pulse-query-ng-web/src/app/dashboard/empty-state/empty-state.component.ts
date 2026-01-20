/**
 * @fileoverview Empty State & Onboarding Component.
 *
 * Designed to guide users when a dashboard has no content.
 * Provides three clear entry points:
 * 1. Wizard: Structured creation.
 * 2. AI: Natural language creation.
 * 3. Seeding: Instant hydration with sample data.
 */

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';

import { DashboardStore } from '../dashboard.store';
import { AskDataService } from '../../global/ask-data.service';
import { WidgetBuilderComponent } from '../widget-builder/widget-builder.component';

@Component({
  selector: 'app-empty-state',
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 400px;
      padding: 48px;
      background-color: var(--sys-background);
    }

    .hero-text {
      text-align: center;
      margin-bottom: 48px;
    }

    .hero-title {
      font-size: 2rem;
      font-weight: 300;
      color: var(--sys-text-primary);
      margin-bottom: 8px;
    }

    .hero-subtitle {
      font-size: 1rem;
      color: var(--sys-text-secondary);
      max-width: 600px;
      margin: 0 auto;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 24px;
      width: 100%;
      max-width: 1000px;
    }

    .action-card {
      background: var(--sys-surface);
      border: 1px solid var(--sys-surface-border);
      border-radius: 12px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
      cursor: pointer;
      position: relative;
      overflow: hidden;
    }

    .action-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 24px rgba(0,0,0,0.08);
      border-color: var(--sys-primary);
    }

    .action-card:focus-visible {
      outline: 2px solid var(--sys-primary);
      outline-offset: 4px;
    }

    .card-icon-bg {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
    }

    .icon-wizard { background-color: #e3f2fd; color: #1976d2; }
    .icon-ai { background-color: #f3e5f5; color: #7b1fa2; }
    .icon-seed { background-color: #e8f5e9; color: #2e7d32; }

    .card-title {
      font-size: 1.1rem;
      font-weight: 500;
      color: var(--sys-text-primary);
      margin-bottom: 8px;
    }

    .card-desc {
      font-size: 0.875rem;
      color: var(--sys-text-secondary);
      line-height: 1.5;
      margin-bottom: 24px;
      flex-grow: 1;
    }

    .card-action {
      margin-top: auto;
      width: 100%;
      text-align: right;
    }

    @media (max-width: 768px) {
      .cards-grid {
        grid-template-columns: 1fr;
      }
      :host {
        padding: 24px;
      }
    }
  `],
  template: `
    <div class="hero-text">
      <h2 class="hero-title">Start your Analysis</h2>
      <p class="hero-subtitle">This dashboard is currently empty. Choose how you would like to begin building your view.</p>
    </div>

    <div class="cards-grid">
      
      <!-- Option 1: Wizard -->
      <div 
        class="action-card" 
        (click)="openWizard()" 
        tabindex="0" 
        (keydown.enter)="openWizard()"
        role="button"
        aria-label="Start with a Template"
      >
        <div class="card-icon-bg icon-wizard">
          <mat-icon>library_add</mat-icon>
        </div>
        <h3 class="card-title">Start with a Template</h3>
        <p class="card-desc">
          Browse the analytics marketplace for pre-built metrics like "Admission Lag" or "Utilization Spikes".
        </p>
        <div class="card-action">
          <span class="text-primary font-medium text-sm">Open Wizard &rarr;</span>
        </div>
      </div>

      <!-- Option 2: AI -->
      <div 
        class="action-card" 
        (click)="openAi()" 
        tabindex="0" 
        (keydown.enter)="openAi()"
        role="button"
        aria-label="Ask AI a Question"
      >
        <div class="card-icon-bg icon-ai">
          <mat-icon>smart_toy</mat-icon>
        </div>
        <h3 class="card-title">Ask AI a Question</h3>
        <p class="card-desc">
          Describe what you want to see in plain English. Our AI will generate the SQL and visualization for you.
        </p>
        <div class="card-action">
          <span class="text-accent font-medium text-sm">Open Assistant &rarr;</span>
        </div>
      </div>

      <!-- Option 3: Seeder -->
      <div 
        class="action-card" 
        (click)="loadSamples()" 
        tabindex="0" 
        (keydown.enter)="loadSamples()"
        role="button"
        aria-label="Load Sample Data"
      >
        <div class="card-icon-bg icon-seed">
          <mat-icon>restore</mat-icon>
        </div>
        <h3 class="card-title">Load Sample Data</h3>
        <p class="card-desc">
          Instantly populate this dashboard with the standard "Hospital Command Center" content pack.
        </p>
        <div class="card-action">
          <button mat-flat-button color="primary" [disabled]="store.isLoading()">
            @if (store.isLoading()) { Loading... } @else { Auto-Fill }
          </button>
        </div>
      </div>

    </div>
  `
})
export class EmptyStateComponent {
  readonly store = inject(DashboardStore);
  private readonly dialog = inject(MatDialog);
  private readonly askDataService = inject(AskDataService);

  openWizard(): void {
    const dashboard = this.store.dashboard();
    if (!dashboard) return;

    // Enable Edit Mode implicitly to allow user to manage the new widget
    if (!this.store.isEditMode()) {
      this.store.toggleEditMode();
    }

    const ref = this.dialog.open(WidgetBuilderComponent, {
      data: { dashboardId: dashboard.id },
      width: '1200px',
      maxWidth: '95vw',
      height: '90vh',
      panelClass: 'no-padding-dialog',
      disableClose: true
    });

    ref.afterClosed().subscribe((res: boolean) => {
      if (res) this.store.loadDashboard(dashboard.id);
    });
  }

  openAi(): void {
    this.askDataService.open();
  }

  loadSamples(): void {
    this.store.createDefaultDashboard();
  }
}