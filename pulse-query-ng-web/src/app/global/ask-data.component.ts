import { Component, inject, ChangeDetectionStrategy, signal, OnDestroy, PLATFORM_ID, effect } from '@angular/core'; 
import { CommonModule, isPlatformBrowser } from '@angular/common'; 

// Material Imports
import { MatButtonModule } from '@angular/material/button'; 
import { MatIconModule } from '@angular/material/icon'; 
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'; 
import { MatToolbarModule } from '@angular/material/toolbar'; 

import { AskDataService } from './ask-data.service'; 
import { SqlBuilderComponent } from '../editors/sql-builder.component'; 
import { DashboardsService, DashboardCreate, DashboardResponse, WidgetResponse } from '../api-client'; 
import { AuthService } from '../core/auth/auth.service'; 

/** 
 * AskDataComponent
 * 
 * The content definition for the Global "Ask Data" Sidenav. 
 * 
 * Responsibilities: 
 * 1. Manages the lifecycle of a "Scratchpad" Dashboard (create on login, check existing, reuse). 
 * 2. Hosts the `SqlBuilderComponent` for ad-hoc analysis. 
 * 3. Provides a header with a Close action (delegates to Service). 
 */ 
@Component({ 
  selector: 'app-ask-data', 
  standalone: true, 
  imports: [ 
    CommonModule, 
    SqlBuilderComponent, 
    MatButtonModule, 
    MatIconModule, 
    MatProgressSpinnerModule, 
    MatToolbarModule
  ], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { 
      display: flex; 
      flex-direction: column; 
      height: 100%; 
      background-color: white; 
      width: 100%; 
    } 
    .content-area { 
      flex-grow: 1; 
      position: relative; 
      overflow: hidden; 
      display: flex; 
      flex-direction: column; 
    } 
    .center-overlay { 
      position: absolute; 
      inset: 0; 
      display: flex; 
      flex-direction: column; 
      align-items: center; 
      justify-content: center; 
      text-align: center; 
      background: rgba(255,255,255,0.9); 
      z-index: 10; 
      padding: 24px; 
    } 
  `], 
  template: `
    <!-- Header -->
    <mat-toolbar color="white" class="border-b">
      <span class="flex-grow font-medium">Ask Data</span>
      <span class="text-xs text-gray-500 mr-4 font-normal">Ad-hoc Analysis Scratchpad</span>
      
      <button mat-icon-button (click)="vis.close()" data-testid="close-btn">
        <mat-icon>close</mat-icon>
      </button>
    </mat-toolbar>

    <!-- Content -->
    <div class="content-area">
      
      <!-- Loading State -->
      @if (loadingContext()) { 
        <div class="center-overlay" data-testid="loading-state">
           <mat-spinner diameter="40" class="mb-4"></mat-spinner>
           <span class="text-sm text-gray-600">Initializing Environment...</span>
        </div>
      } 
      
      <!-- Error State -->
      @if (contextError()) { 
        <div class="center-overlay" data-testid="error-state">
          <mat-icon class="text-red-500 text-4xl mb-2">error_outline</mat-icon>
          <span class="text-red-600 font-medium">{{ contextError() }}</span>
        </div>
      } 

      <!-- Builder Instance -->
      @if (scratchpadIds(); as ids) { 
         <app-sql-builder
           [dashboardId]="ids.dashboardId" 
           [widgetId]="ids.widgetId" 
           [initialSql]="'SELECT * FROM hospital_visits LIMIT 5'" 
           class="h-full w-full block" 
         ></app-sql-builder>
      } 
    </div>
  `
}) 
export class AskDataComponent implements OnDestroy { 
  /** Public visibility service for template access (closing). */ 
  public readonly vis = inject(AskDataService); 
  
  private readonly dashboardsApi = inject(DashboardsService); 
  private readonly auth = inject(AuthService); 
  private readonly platformId = inject(PLATFORM_ID); 
  private readonly SCRATCHPAD_NAME = 'Scratchpad (Temp)'; 
  private readonly WIDGET_TITLE = 'AdHoc Query'; 

  readonly loadingContext = signal(true); 
  readonly contextError = signal<string | null>(null); 
  readonly scratchpadIds = signal<{ dashboardId: string, widgetId: string } | null>(null); 

  constructor() { 
    if (isPlatformBrowser(this.platformId)) { 
      effect(() => { 
        const isAuthenticated = this.auth.isAuthenticated(); 
        const hasContext = !!this.scratchpadIds(); 

        // 1. Initialize if Logged In and context missing
        if (isAuthenticated && !hasContext) { 
           this.initializeScratchpad(); 
        } 

        // 2. Clear context on Logout
        if (!isAuthenticated && hasContext) { 
           this.scratchpadIds.set(null); 
           this.loadingContext.set(true); 
           this.contextError.set(null); 
        } 
      }); 
    } else { 
      this.loadingContext.set(false); 
    } 
  } 

  /** 
   * Cleaning up via API is best-effort on destroy. 
   * Browsers often cancel pending requests on page unload. 
   */ 
  ngOnDestroy(): void { 
    if (isPlatformBrowser(this.platformId)) { 
      const ids = this.scratchpadIds(); 
      if (ids) { 
        this.dashboardsApi.deleteDashboardApiV1DashboardsDashboardIdDelete(ids.dashboardId) 
          .subscribe({ 
            error: (err) => console.warn('Failed to clean up scratchpad', err) 
          }); 
      } 
    } 
  } 

  private initializeScratchpad(): void { 
    this.loadingContext.set(true); 
    this.contextError.set(null); 

    // Step 1: Check if one already exists (from a previous session that wasn't cleaned up) 
    this.dashboardsApi.listDashboardsApiV1DashboardsGet().subscribe({ 
      next: (dashboards: DashboardResponse[]) => { 
        const existing = dashboards.find(d => d.name === this.SCRATCHPAD_NAME); 
        if (existing) { 
          this.ensureWidget(existing.id, existing.widgets || []); 
        } else { 
          this.createDashboard(); 
        } 
      }, 
      error: (err) => this.handleError('Failed to check existing scratchpads.', err) 
    }); 
  } 

  private createDashboard(): void { 
    const scratchDash: DashboardCreate = { name: this.SCRATCHPAD_NAME }; 
    this.dashboardsApi.createDashboardApiV1DashboardsPost(scratchDash).subscribe({ 
      next: (dash) => this.ensureWidget(dash.id, []), 
      error: (err) => this.handleError('Failed to initialize scratchpad dashboard.', err) 
    }); 
  } 

  private ensureWidget(dashboardId: string, widgets: WidgetResponse[]): void { 
    const existingWidget = widgets.find(w => w.title === this.WIDGET_TITLE); 
    
    if (existingWidget) { 
      this.setContext(dashboardId, existingWidget.id); 
    } else { 
      this.dashboardsApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost(dashboardId, { 
        title: this.WIDGET_TITLE, 
        type: 'SQL', 
        visualization: 'table', 
        config: { query: 'SELECT * FROM hospital_visits LIMIT 5' } 
      }).subscribe({ 
        next: (widget) => this.setContext(dashboardId, widget.id), 
        error: (err) => this.handleError('Failed to create scratchpad widget.', err) 
      }); 
    } 
  } 

  private setContext(dashboardId: string, widgetId: string): void { 
    this.scratchpadIds.set({ dashboardId, widgetId }); 
    this.loadingContext.set(false); 
  } 

  /** 
   * Handles generic errors during initialization. 
   * @param msg User friendly message. 
   * @param error Actual error object. 
   */ 
  private handleError(msg: string, error: any): void { 
    console.error(error); 
    this.contextError.set(msg); 
    this.loadingContext.set(false); 
  } 
}