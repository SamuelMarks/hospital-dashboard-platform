import {
  Component,
  inject,
  ChangeDetectionStrategy,
  signal,
  OnDestroy,
  PLATFORM_ID,
  effect,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

// Material Imports
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AskDataService } from './ask-data.service';
import { SqlBuilderComponent } from '../editors/sql-builder.component';
import {
  DashboardsService,
  DashboardCreate,
  DashboardResponse,
  WidgetResponse,
} from '../api-client';
import { AuthService } from '../core/auth/auth.service';
import { QueryCartService } from './query-cart.service';

/**
 * AskDataComponent
 *
 * The content definition for the Global "Ask Data" Sidenav.
 * Orchestrates ad-hoc analysis via a hidden "Scratchpad" dashboard.
 */
@Component({
  selector: 'app-ask-data',
  imports: [
    CommonModule,
    SqlBuilderComponent,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
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
        background: rgba(255, 255, 255, 0.9);
        z-index: 10;
        padding: 24px;
      }
      .ask-data-toolbar {
        background-color: var(--sys-surface);
        height: 64px;
        margin-bottom: 0;
        color: var(--sys-text-primary);
        border-bottom: 1px solid var(--sys-surface-border);
      }
      .cart-indicator {
        border: 1px solid var(--sys-outline-variant);
        color: var(--sys-text-secondary);
      }
      .cart-indicator.has-items {
        border-color: var(--sys-primary);
        background-color: var(--sys-primary-container);
        color: var(--sys-on-primary-container);
      }
      .text-primary {
        color: var(--sys-primary);
      }
      .cart-btn {
        display: flex;
        align-items: center;
        padding: 0 12px;
        height: 36px;
        border-radius: 18px;
        transition: all 0.2s;
      }
      .cart-btn.active {
        background-color: var(--sys-primary-container);
        color: var(--sys-on-primary-container);
        border-color: transparent;
      }
    `,
  ],
  templateUrl: './ask-data.component.html',
})
export class AskDataComponent implements OnDestroy {
  public readonly vis = inject(AskDataService);
  private readonly cart = inject(QueryCartService);
  private readonly dashboardsApi = inject(DashboardsService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly snackBar = inject(MatSnackBar);

  private readonly SCRATCHPAD_NAME = 'Scratchpad (Temp)';
  private readonly WIDGET_TITLE = 'AdHoc Query';

  readonly loadingContext = signal(true);
  readonly contextError = signal<string | null>(null);
  readonly scratchpadIds = signal<{ dashboardId: string; widgetId: string } | null>(null);
  readonly cartCount = this.cart.count;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      effect(() => {
        const isAuthenticated = this.auth.isAuthenticated();
        const hasContext = !!this.scratchpadIds();

        if (isAuthenticated && !hasContext) {
          this.initializeScratchpad();
        }

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

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      const ids = this.scratchpadIds();
      if (ids) {
        this.dashboardsApi
          .deleteDashboardApiV1DashboardsDashboardIdDelete(ids.dashboardId)
          .subscribe({
            error: (err) => console.warn('Failed to clean up scratchpad', err),
          });
      }
    }
  }

  private initializeScratchpad(): void {
    this.loadingContext.set(true);
    this.contextError.set(null);

    this.dashboardsApi.listDashboardsApiV1DashboardsGet().subscribe({
      next: (dashboards: DashboardResponse[]) => {
        const existing = dashboards.find((d) => d.name === this.SCRATCHPAD_NAME);
        if (existing) {
          this.ensureWidget(existing.id, existing.widgets || []);
        } else {
          this.createDashboard();
        }
      },
      error: (err) => this.handleError('Failed to check existing scratchpads.', err),
    });
  }

  private createDashboard(): void {
    const scratchDash: DashboardCreate = { name: this.SCRATCHPAD_NAME };
    this.dashboardsApi.createDashboardApiV1DashboardsPost(scratchDash).subscribe({
      next: (dash) => this.ensureWidget(dash.id, []),
      error: (err) => this.handleError('Failed to initialize scratchpad dashboard.', err),
    });
  }

  private ensureWidget(dashboardId: string, widgets: WidgetResponse[]): void {
    const existingWidget = widgets.find((w) => w.title === this.WIDGET_TITLE);

    if (existingWidget) {
      this.setContext(dashboardId, existingWidget.id);
    } else {
      this.dashboardsApi
        .createWidgetApiV1DashboardsDashboardIdWidgetsPost(dashboardId, {
          title: this.WIDGET_TITLE,
          type: 'SQL',
          visualization: 'table',
          config: { query: 'SELECT * FROM hospital_data LIMIT 5' },
        })
        .subscribe({
          next: (widget) => this.setContext(dashboardId, widget.id),
          error: (err) => this.handleError('Failed to create scratchpad widget.', err),
        });
    }
  }

  private setContext(dashboardId: string, widgetId: string): void {
    this.scratchpadIds.set({ dashboardId, widgetId });
    this.loadingContext.set(false);
  }

  private handleError(msg: string, error: any): void {
    console.error(error);
    this.contextError.set(msg);
    this.loadingContext.set(false);
  }

  handleSaveToCart(sql: string): void {
    this.cart.add(sql);
    this.snackBar.open('Query saved to Cart. Open dashboard editor to use.', 'OK', {
      duration: 3000,
    });
  }
}
