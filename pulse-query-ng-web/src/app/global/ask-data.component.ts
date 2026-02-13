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
 *
 * Responsibilities:
 * 1. Manages the lifecycle of a "Scratchpad" Dashboard (create checking on load).
 * 2. Hosts the `SqlBuilderComponent` for ad-hoc analysis.
 * 3. Provides a header with a Close action (delegates to Service).
 * 4. Saves ad-hoc SQL into the Query Cart.
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
    `,
  ],
  templateUrl: './ask-data.component.html',
})
export class AskDataComponent implements OnDestroy {
  /** Vis. */
  public readonly vis = inject(AskDataService);
  /** cart property. */
  private readonly cart = inject(QueryCartService);

  /** dashboardsApi property. */
  private readonly dashboardsApi = inject(DashboardsService);
  /** auth property. */
  private readonly auth = inject(AuthService);
  /** platformId property. */
  private readonly platformId = inject(PLATFORM_ID);
  /** SCRATCHPAD_NAME property. */
  private readonly SCRATCHPAD_NAME = 'Scratchpad (Temp)';
  /** WIDGET_TITLE property. */
  private readonly WIDGET_TITLE = 'AdHoc Query';

  /** Loading Context. */
  readonly loadingContext = signal(true);
  /** Context Error. */
  readonly contextError = signal<string | null>(null);
  /** Scratchpad Ids. */
  readonly scratchpadIds = signal<{ dashboardId: string; widgetId: string } | null>(null);
  /** Cart Count. */
  readonly cartCount = this.cart.count;

  /** Creates a new AskDataComponent. */
  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      // Initialize immediately on construction (App startup), independent of visibility
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

  /** Ng On Destroy. */
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

  /** initializeScratchpad method. */
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

  /** createDashboard method. */
  private createDashboard(): void {
    const scratchDash: DashboardCreate = { name: this.SCRATCHPAD_NAME };
    this.dashboardsApi.createDashboardApiV1DashboardsPost(scratchDash).subscribe({
      next: (dash) => this.ensureWidget(dash.id, []),
      error: (err) => this.handleError('Failed to initialize scratchpad dashboard.', err),
    });
  }

  /** ensureWidget method. */
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

  /** setContext method. */
  private setContext(dashboardId: string, widgetId: string): void {
    this.scratchpadIds.set({ dashboardId, widgetId });
    this.loadingContext.set(false);
  }

  /** handleError method. */
  private handleError(msg: string, error: any): void {
    console.error(error);
    this.contextError.set(msg);
    this.loadingContext.set(false);
  }

  /** Adds the current SQL to the query cart. */
  handleSaveToCart(sql: string): void {
    this.cart.add(sql);
  }
}
