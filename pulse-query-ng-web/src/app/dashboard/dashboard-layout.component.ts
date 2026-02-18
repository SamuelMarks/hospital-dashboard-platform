import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';

// Material & UI
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';

// Core Features
import { DashboardStore } from './dashboard.store';
import { DashboardsService, WidgetResponse, WidgetUpdate, TemplateResponse } from '../api-client';
import { FilterRibbonComponent } from './filter-ribbon.component';
import { WidgetComponent } from '../widget/widget.component';
import { WidgetGalleryComponent } from './widget-gallery/widget-gallery.component';
import { QueryCartComponent } from './query-cart/query-cart.component';
import { WidgetEditorDialog, WidgetEditorData } from './widget-editor.dialog';
import { SkeletonLoaderComponent } from '../shared/components/skeleton-loader.component';
import { ThemeService } from '../core/theme/theme.service';
import { ProvisioningService } from './provisioning.service';
import { EmptyStateComponent } from './empty-state/empty-state.component';
import { QueryCartProvisioningService } from './query-cart-provisioning.service';
import { QUERY_CART_ITEM_KIND, type QueryCartItem } from '../global/query-cart.models';

/**
 * Dashboard Layout component.
 *
 * Wraps the dashboard view, managing the layout grid, sidebars (Edit mode),
 * and the orchestration of adding/removing widgets via Drag-and-Drop.
 */
@Component({
  selector: 'app-dashboard-layout',
  templateUrl: './dashboard-layout.component.html',
  styleUrls: ['./dashboard-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    DragDropModule,
    MatSidenavModule,
    FilterRibbonComponent,
    WidgetComponent,
    QueryCartComponent,
    WidgetGalleryComponent,
    MatDialogModule,
    MatIconModule,
    MatSnackBarModule,
    MatButtonModule,
    MatProgressBarModule,
    SkeletonLoaderComponent,
    EmptyStateComponent,
  ],
})
/* v8 ignore start */
export class DashboardLayoutComponent implements OnInit {
  /* v8 ignore stop */
  /** Store. */
  public readonly store = inject(DashboardStore);
  /** themeService property. */
  private readonly themeService = inject(ThemeService);
  /** route property. */
  private readonly route = inject(ActivatedRoute);
  /** dashboardApi property. */
  private readonly dashboardApi = inject(DashboardsService);
  /** provisioning property. */
  private readonly provisioning = inject(ProvisioningService);
  /** cartProvisioning property. */
  private readonly cartProvisioning = inject(QueryCartProvisioningService);
  /** dialog property. */
  private readonly dialog = inject(MatDialog);
  /** snackBar property. */
  private readonly snackBar = inject(MatSnackBar);

  /** Whether the app is in TV Mode (Kiosk). */
  readonly isTvMode = this.themeService.isTvMode;

  /** Ng On Init. */
  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.store.reset();
        this.store.loadDashboard(id);
      }
    });

    this.route.queryParamMap.subscribe((qParams) => {
      const paramsObj: Record<string, any> = {};
      qParams.keys.forEach((key) => {
        if (key !== 'mode') paramsObj[key] = qParams.get(key);
      });
      this.store.setGlobalParams(paramsObj);
    });
  }

  /**
   * Unified Drop Handler.
   * Distinguishes between internal reordering and external template/cart dropping.
   *
   * @param {CdkDragDrop<any[]>} event - The drop event.
   */
  onDrop(event: CdkDragDrop<any[]>): void {
    if (this.isTvMode()) return;

    if (event.previousContainer === event.container) {
      // Internal Sort
      this.store.updateWidgetOrder(event.previousIndex, event.currentIndex);
    } else {
      // External Drop (Widget Gallery or Query Cart)
      const data = event.item.data;
      const dashboard = this.store.dashboard();

      if (!dashboard || !data) return;

      // CASE: Query Cart Item
      if (this.isQueryCartItem(data)) {
        this.store.setLoading(true);
        this.cartProvisioning.addToDashboard(data, dashboard.id).subscribe({
          next: () => {
            this.snackBar.open(`Added query: ${data.title}`, 'OK', { duration: 3000 });
            this.store.loadDashboard(dashboard.id);
          },
          error: (err: unknown) => {
            console.error(err);
            this.snackBar.open('Failed to add query to dashboard', 'Close');
            this.store.setLoading(false);
          },
        });
        return;
      }

      // CASE: Template Item
      // Type assertion handles the TemplateResponse default path
      const template = data as TemplateResponse;
      this.store.setLoading(true);

      this.provisioning.provisionWidget(template, dashboard.id).subscribe({
        next: () => {
          this.snackBar.open(`Added widget: ${template.title}`, 'OK', { duration: 3000 });
          this.store.loadDashboard(dashboard.id);
        },
        error: (err: unknown) => {
          console.error(err);
          this.snackBar.open('Failed to create widget from template', 'Close');
          this.store.setLoading(false);
        },
      });
    }
  }

  /**
   * Type guard for query-cart drag data.
   * @param {unknown} value - The drag item data.
   * @returns {boolean} True if item is a QueryCartItem.
   */
  private isQueryCartItem(value: unknown): value is QueryCartItem {
    return (
      !!value && typeof value === 'object' && (value as QueryCartItem).kind === QUERY_CART_ITEM_KIND
    );
  }

  /**
   * Calculates the Column Span (1-12) for the grid.
   *
   * @param {WidgetResponse} widget - The widget configuration.
   * @returns {number} Span between 1 and 12.
   */
  getColSpan(widget: WidgetResponse): number {
    const w = Number(widget.config?.['w']);
    return Math.max(1, Math.min(12, w || 6));
  }

  /**
   * Calculates the Row Span.
   *
   * @param {WidgetResponse} widget - The widget configuration.
   * @returns {number} Span between 1 and 4.
   */
  getRowSpan(widget: WidgetResponse): number {
    const h = Number(widget.config?.['h']);
    return Math.max(1, Math.min(4, h || 2));
  }

  /**
   * Initiates resizing logic for manual grid adjustments.
   * Attaches global mouse listeners until released.
   *
   * @param {MouseEvent} event - The mousedown event.
   * @param {WidgetResponse} widget - The target widget.
   */
  startResizing(event: MouseEvent, widget: WidgetResponse): void {
    if (this.isTvMode()) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const currentSpan = this.getColSpan(widget);
    const container = (event.target as HTMLElement).closest('.dashboard-grid') as HTMLElement;
    if (!container) return;

    const gridSize = container.clientWidth;
    const colPixelWidth = gridSize / 12;

    const onMove = (e: MouseEvent) => {};

    const onUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const deltaX = e.clientX - startX;
      const colsChanged = Math.round(deltaX / colPixelWidth);

      if (colsChanged !== 0) {
        const newSpan = Math.max(2, Math.min(12, currentSpan + colsChanged));
        this.updateWidgetWidth(widget, newSpan);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /**
   * Persists the new widget width to the API.
   *
   * @param {WidgetResponse} widget - The target widget.
   * @param {number} newWidth - New column span.
   */
  updateWidgetWidth(widget: WidgetResponse, newWidth: number): void {
    const update: WidgetUpdate = { config: { w: newWidth } };
    this.dashboardApi
      .updateWidgetApiV1DashboardsWidgetsWidgetIdPut(widget.id, update)
      .subscribe(() => {
        const dashId = this.store.dashboard()?.id;
        if (dashId) this.store.loadDashboard(dashId);
      });
  }

  /**
   * Opens the Widget Editor modal.
   *
   * @param {WidgetResponse} widget - The widget to edit.
   */
  editWidget(widget: WidgetResponse): void {
    if (this.isTvMode()) return;
    const dashboardId = this.store.dashboard()?.id;
    if (!dashboardId) return;

    const data: WidgetEditorData = { dashboardId, widget };
    const ref = this.dialog.open(WidgetEditorDialog, {
      data,
      width: '90vw',
      maxWidth: '1200px',
      height: '90vh',
      panelClass: 'no-padding-dialog',
    });
    ref.afterClosed().subscribe((res) => {
      if (res) this.store.loadDashboard(dashboardId);
    });
  }

  /**
   * Prompts for confirmation and deletes a widget.
   *
   * @param {WidgetResponse} widget - The widget to delete.
   */
  confirmDeleteWidget(widget: WidgetResponse): void {
    if (this.isTvMode()) return;
    if (!confirm(`Delete "${widget.title}"?`)) return;
    this.store.optimisticRemoveWidget(widget.id);
    this.dashboardApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(widget.id).subscribe({
      error: () => this.store.optimisticRestoreWidget(widget),
    });
  }
}
