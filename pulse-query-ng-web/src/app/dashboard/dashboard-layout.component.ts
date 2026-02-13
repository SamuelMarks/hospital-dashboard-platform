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
// ToolbarComponent removed (Moved to App Layout)
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

/** Dashboard Layout component. */
@Component({
  selector: 'app-dashboard-layout',
  templateUrl: './dashboard-layout.component.html',
  styleUrls: ['./dashboard-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    DragDropModule,
    MatSidenavModule,
    // ToolbarComponent removed
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
export class DashboardLayoutComponent implements OnInit {
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

  /** Whether tv Mode. */
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
   */
  onDrop(event: CdkDragDrop<any[]>): void {
    if (this.isTvMode()) return;

    if (event.previousContainer === event.container) {
      this.store.updateWidgetOrder(event.previousIndex, event.currentIndex);
    } else {
      const data = event.item.data;
      const dashboard = this.store.dashboard();

      if (!dashboard || !data) return;

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

  /** Type guard for query-cart drag data. */
  private isQueryCartItem(value: unknown): value is QueryCartItem {
    return (
      !!value && typeof value === 'object' && (value as QueryCartItem).kind === QUERY_CART_ITEM_KIND
    );
  }

  /** Gets col Span. */
  getColSpan(widget: WidgetResponse): number {
    const w = Number(widget.config?.['w']);
    return Math.max(1, Math.min(12, w || 6));
  }

  /** Gets row Span. */
  getRowSpan(widget: WidgetResponse): number {
    const h = Number(widget.config?.['h']);
    return Math.max(1, Math.min(4, h || 2));
  }

  /** Start Resizing. */
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

  /** Updates widget Width. */
  updateWidgetWidth(widget: WidgetResponse, newWidth: number): void {
    const update: WidgetUpdate = { config: { w: newWidth } };
    this.dashboardApi
      .updateWidgetApiV1DashboardsWidgetsWidgetIdPut(widget.id, update)
      .subscribe(() => {
        const dashId = this.store.dashboard()?.id;
        if (dashId) this.store.loadDashboard(dashId);
      });
  }

  /** Edit Widget. */
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

  /** Confirm Delete Widget. */
  confirmDeleteWidget(widget: WidgetResponse): void {
    if (this.isTvMode()) return;
    if (!confirm(`Delete "${widget.title}"?`)) return;
    this.store.optimisticRemoveWidget(widget.id);
    this.dashboardApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(widget.id).subscribe({
      error: () => this.store.optimisticRestoreWidget(widget),
    });
  }
}
