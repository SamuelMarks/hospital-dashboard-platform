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
import { ToolbarComponent } from './toolbar.component'; 
import { FilterRibbonComponent } from './filter-ribbon.component'; 
import { WidgetComponent } from '../widget/widget.component'; 
import { WidgetGalleryComponent } from './widget-gallery/widget-gallery.component'; 
import { WidgetEditorDialog, WidgetEditorData } from './widget-editor.dialog'; 
import { SkeletonLoaderComponent } from '../shared/components/skeleton-loader.component'; 
import { ThemeService } from '../core/theme/theme.service'; 
import { ProvisioningService } from './provisioning.service'; 
import { EmptyStateComponent } from './empty-state/empty-state.component'; 

@Component({ 
  selector: 'app-dashboard-layout', 
  templateUrl: './dashboard-layout.component.html', 
  styleUrls: ['./dashboard-layout.component.scss'], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  imports: [ 
    CommonModule, 
    DragDropModule, 
    MatSidenavModule, 
    ToolbarComponent, 
    FilterRibbonComponent, 
    WidgetComponent, 
    WidgetGalleryComponent, 
    MatDialogModule, 
    MatIconModule, 
    MatSnackBarModule, 
    MatButtonModule, 
    MatProgressBarModule, 
    SkeletonLoaderComponent, 
    EmptyStateComponent
  ] 
}) 
export class DashboardLayoutComponent implements OnInit { 
  public readonly store = inject(DashboardStore); 
  private readonly themeService = inject(ThemeService); 
  private readonly route = inject(ActivatedRoute); 
  private readonly dashboardApi = inject(DashboardsService); 
  private readonly provisioning = inject(ProvisioningService); 
  private readonly dialog = inject(MatDialog); 
  private readonly snackBar = inject(MatSnackBar); 

  readonly isTvMode = this.themeService.isTvMode; 

  ngOnInit(): void { 
    this.route.paramMap.subscribe(params => { 
      const id = params.get('id'); 
      if (id) { 
        this.store.reset(); 
        this.store.loadDashboard(id); 
      } 
    }); 

    this.route.queryParamMap.subscribe(qParams => { 
      const paramsObj: Record<string, any> = {}; 
      qParams.keys.forEach(key => { 
        if (key !== 'mode') paramsObj[key] = qParams.get(key); 
      }); 
      this.store.setGlobalParams(paramsObj); 
    }); 
  } 

  /** 
   * Unified Drop Handler. 
   * Distinguishes between internal reordering and external template dropping. 
   */ 
  onDrop(event: CdkDragDrop<any[]>): void { 
    if (this.isTvMode()) return; 

    if (event.previousContainer === event.container) { 
      // Case A: Reorder existing widgets
      this.store.updateWidgetOrder(event.previousIndex, event.currentIndex); 
    } else { 
      // Case B: Dragged from Sidebar (Template) 
      const template = event.item.data as TemplateResponse; 
      const dashboard = this.store.dashboard(); 
      
      if (dashboard && template) { 
        // Optimistic: The Store will reload. 
        this.store.setLoading(true); 

        this.provisioning.provisionWidget(template, dashboard.id).subscribe({ 
          next: () => { 
            this.snackBar.open(`Added widget: ${template.title}`, 'OK', { duration: 3000 }); 
            // Reload to get correct position/ID
            this.store.loadDashboard(dashboard.id); 
          }, 
          error: (err: unknown) => { 
            console.error(err); 
            this.snackBar.open('Failed to create widget from template', 'Close'); 
            this.store.setLoading(false); 
          } 
        }); 
      } 
    } 
  } 

  /** Calculates Column Span (1-12) */ 
  getColSpan(widget: WidgetResponse): number { 
    const w = Number(widget.config?.['w']); 
    return Math.max(1, Math.min(12, w || 6)); 
  } 

  /** Calculates Row Span */ 
  getRowSpan(widget: WidgetResponse): number { 
    const h = Number(widget.config?.['h']); 
    return Math.max(1, Math.min(4, h || 2)); 
  } 

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

  updateWidgetWidth(widget: WidgetResponse, newWidth: number): void { 
    const update: WidgetUpdate = { config: { w: newWidth } }; 
    this.dashboardApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(widget.id, update) 
      .subscribe(() => { 
        const dashId = this.store.dashboard()?.id; 
        if (dashId) this.store.loadDashboard(dashId); 
      }); 
  } 

  editWidget(widget: WidgetResponse): void { 
    if (this.isTvMode()) return; 
    const dashboardId = this.store.dashboard()?.id; 
    if (!dashboardId) return; 

    const data: WidgetEditorData = { dashboardId, widget }; 
    const ref = this.dialog.open(WidgetEditorDialog, { 
      data, width: '90vw', maxWidth: '1200px', height: '90vh', panelClass: 'no-padding-dialog' 
    }); 
    ref.afterClosed().subscribe(res => { if (res) this.store.loadDashboard(dashboardId); }); 
  } 

  confirmDeleteWidget(widget: WidgetResponse): void { 
    if (this.isTvMode()) return; 
    if (!confirm(`Delete "${widget.title}"?`)) return; 
    this.store.optimisticRemoveWidget(widget.id); 
    this.dashboardApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(widget.id).subscribe({ 
      error: () => this.store.optimisticRestoreWidget(widget) 
    }); 
  } 
}