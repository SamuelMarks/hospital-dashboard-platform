/**
 * @fileoverview Dashboard layout component orchestrating the responsive widget grid,
 * edit-mode sidebars, drag-and-drop provisioning, and undo/redo actions.
 */
import { Component, DestroyRef, OnInit, OnDestroy, inject } from '@angular/core';
import { DatePipe, DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { DragDropModule } from '@angular/cdk/drag-drop';

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
import { ConfirmDialogComponent } from '../shared/components/dialogs/confirm-dialog.component';
import { DashboardCollaborationCoordinator } from './dashboard-collaboration-coordinator.service';
import { DATE_NOW } from '../core/time.token';
import { UndoRedoService } from '../core/undo/undo-redo.service';
import { DeleteWidgetCommand } from '../core/undo/dashboard-commands';
import { FocusTrapDirective } from '../core/accessibility/focus-trap.directive';

/**
 * Minimal drag-drop event contract required by `DashboardLayoutComponent.onDrop`.
 */
export interface DashboardDropEvent {
  /** Source drop list container reference. */
  previousContainer: unknown;
  /** Target drop list container reference. */
  container: unknown;
  /** Previous index of the dragged item. */
  previousIndex: number;
  /** Target index of the dropped item. */
  currentIndex: number;
  /** Dragged item wrapper containing optional payload data. */
  item?: { data?: unknown };
}

/**
 * Dashboard Layout component.
 *
 * Wraps the dashboard view, managing the layout grid, sidebars (Edit mode),
 * and the orchestration of adding/removing widgets via Drag-and-Drop.
 */
@Component({
  selector: 'app-dashboard-layout',
  templateUrl: './dashboard-layout.component.html',
  styleUrl: './dashboard-layout.component.scss',

  imports: [
    DatePipe,
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
    FocusTrapDirective,
  ],
})
export class DashboardLayoutComponent implements OnInit, OnDestroy {
  /** Centralized reactive state store for the active hospital dashboard. */
  public readonly store = inject(DashboardStore);
  /** Theme service providing dark-mode and TV kiosk mode signals. */
  private readonly themeService = inject(ThemeService);
  /** Activated route used to observe dashboard ID and global filter query parameters. */
  private readonly route = inject(ActivatedRoute);
  /** Generated OpenAPI service for dashboard and widget CRUD operations. */
  private readonly dashboardApi = inject(DashboardsService);
  /** Provisioning service for instantiating widget templates onto the dashboard. */
  private readonly provisioning = inject(ProvisioningService);
  /** Service converting staged Query Cart SQL items into persisted dashboard widgets. */
  private readonly cartProvisioning = inject(QueryCartProvisioningService);
  /** Material dialog service used to open widget editor and confirmation modals. */
  private readonly dialog = inject(MatDialog);
  /** Material snackbar service used to display status and undo toast notifications. */
  private readonly snackBar = inject(MatSnackBar);
  /** Coordinator managing real-time WebSocket collaboration presence and remote widget refresh events. */
  private readonly collaborationCoordinator = inject(DashboardCollaborationCoordinator);
  /** Undo/redo command history service for reversible widget mutations. */
  private readonly undoRedoService = inject(UndoRedoService);
  /** Injected clock function returning the current Date instance. */
  private readonly dateNow = inject(DATE_NOW);
  /** Injected DOM document reference. */
  private readonly document = inject(DOCUMENT);
  /** DestroyRef for cleaning up route subscriptions. */
  private readonly destroyRef = inject(DestroyRef);

  /** Whether the app is in TV Mode (Kiosk). */
  readonly isTvMode = this.themeService.isTvMode;

  /** Subscribes to route parameters, collaboration socket updates, and global filter query params. */
  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.store.reset();
        this.store.loadDashboard(id);
        this.collaborationCoordinator.connect(id, (widgetId) => {
          this.store.refreshWidget(widgetId);
        });
      }
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((qParams) => {
      const paramsObj: Record<string, string | null> = {};
      qParams.keys.forEach((key) => {
        if (key !== 'mode') paramsObj[key] = qParams.get(key);
      });
      this.store.setGlobalParams(paramsObj);
    });
  }

  /** Disconnects the collaboration coordinator when the layout component is destroyed. */
  ngOnDestroy(): void {
    this.collaborationCoordinator.disconnect();
  }

  /**
   * Unified Drop Handler.
   * Distinguishes between internal reordering and external template/cart dropping.
   *
   * @param event - The drop event.
   */
  onDrop(event: DashboardDropEvent): void {
    if (this.isTvMode()) return;

    if (event.previousContainer === event.container) {
      // Internal Sort
      this.store.updateWidgetOrder(event.previousIndex, event.currentIndex);
    } else {
      // External Drop (Widget Gallery or Query Cart)
      const data: unknown = event.item?.data;
      const dashboard = this.store.dashboard();

      if (!dashboard || !data) return;

      // CASE: Query Cart Item
      if (this.isQueryCartItem(data)) {
        this.store.setLoading(true);
        this.cartProvisioning.addToDashboard(data, dashboard.id).subscribe({
          next: () => {
            this.snackBar.open($localize`Added query: ${data.title}`, $localize`OK`, {
              duration: 3000,
            });
            this.store.loadDashboard(dashboard.id);
          },
          error: (err: unknown) => {
            console.error(err);
            this.snackBar.open($localize`Failed to add query to dashboard`, $localize`Close`);
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
          this.snackBar.open($localize`Added widget: ${template.title}`, $localize`OK`, {
            duration: 3000,
          });
          this.store.loadDashboard(dashboard.id);
        },
        error: (err: unknown) => {
          console.error(err);
          this.snackBar.open($localize`Failed to create widget from template`, $localize`Close`);
          this.store.setLoading(false);
        },
      });
    }
  }

  /**
   * Type guard for query-cart drag data.
   *
   * @param value - The drag item data.
   * @returns True if item is a QueryCartItem.
   */
  isQueryCartItem(value: unknown): value is QueryCartItem {
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

    const onMove = (e: MouseEvent): void => {
      e.preventDefault();
    };

    const onUp = (e: MouseEvent): void => {
      this.document.removeEventListener('mousemove', onMove);
      this.document.removeEventListener('mouseup', onUp);
      const deltaX = e.clientX - startX;
      const colsChanged = Math.round(deltaX / colPixelWidth);

      if (colsChanged !== 0) {
        const newSpan = Math.max(2, Math.min(12, currentSpan + colsChanged));
        this.updateWidgetWidth(widget, newSpan);
      }
    };
    this.document.addEventListener('mousemove', onMove);
    this.document.addEventListener('mouseup', onUp);
  }

  /**
   * Adjusts widget column span via keyboard arrow keys for accessible resizing.
   *
   * @param event - DOM keyboard event triggered on the resize separator handle.
   * @param widget - Target widget being resized.
   * @param deltaCols - Number of grid columns to add or subtract.
   */
  resizeByKeyboard(event: Event, widget: WidgetResponse, deltaCols: number): void {
    if (this.isTvMode()) return;
    event.preventDefault();
    event.stopPropagation();
    const currentSpan = this.getColSpan(widget);
    const newSpan = Math.max(2, Math.min(12, currentSpan + deltaCols));
    if (newSpan !== currentSpan) {
      this.updateWidgetWidth(widget, newSpan);
    }
  }

  /**
   * Closes the focus/zen mode overlay when the user clicks directly on the backdrop.
   *
   * @param event - DOM mouse click event on the overlay backdrop.
   */
  onFocusOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.store.setFocusedWidget(null);
    }
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

    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: $localize`Delete Widget`,
          message: $localize`Remove "${widget.title}" from this dashboard?`,
          isDestructive: true,
          confirmJson: $localize`Delete`,
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.undoRedoService.execute(
            new DeleteWidgetCommand(widget, this.dashboardApi, this.store, this.dateNow()),
          );
        }
      });
  }
}
