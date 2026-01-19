/** 
 * @fileoverview Dashboard Grid Layout. 
 * 
 * Renders drag-and-drop swimlanes containing widgets. 
 * Handles synchronization between URL Query Params and Store Global Params. 
 */ 

import { Component, OnInit, inject, ChangeDetectionStrategy, computed, Signal } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { ActivatedRoute } from '@angular/router'; 
import { 
  CdkDragDrop, 
  DragDropModule
} from '@angular/cdk/drag-drop'; 

// Material Imports
import { MatDialog, MatDialogModule } from '@angular/material/dialog'; 
import { MatIconModule } from '@angular/material/icon'; 
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar'; 
import { MatButtonModule } from '@angular/material/button'; 
import { MatChipsModule } from '@angular/material/chips'; 

import { DashboardStore } from './dashboard.store'; 
import { DashboardsService, WidgetResponse } from '../api-client'; 
import { ToolbarComponent } from './toolbar.component'; 
import { WidgetComponent } from '../widget/widget.component'; 
import { WidgetEditorDialog, WidgetEditorData } from './widget-editor.dialog'; 
import { SkeletonLoaderComponent } from '../shared/components/skeleton-loader.component'; 

/** 
 * Represents a visual swimlane containing a subset of widgets. 
 */ 
interface DashboardLane { 
  name: string; 
  id: string; 
  widgets: WidgetResponse[]; 
} 

/** 
 * Main Dashboard Layout Component. 
 */ 
@Component({ 
  selector: 'app-dashboard-layout', 
  imports: [ 
    CommonModule, 
    DragDropModule, 
    ToolbarComponent, 
    WidgetComponent, 
    MatDialogModule, 
    MatIconModule, 
    MatSnackBarModule, 
    MatButtonModule, 
    MatChipsModule, 
    SkeletonLoaderComponent
  ], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { 
      display: flex; 
      flex-direction: column; 
      min-height: 100vh; 
      background-color: var(--sys-background); /* Theme aware */ 
    } 
    .view-port { 
      padding: 16px; 
      flex-grow: 1; 
      overflow-y: auto; 
      max-width: 1600px; 
      margin: 0 auto; 
      width: 100%; 
      box-sizing: border-box; 
    } 
    .swimlane { 
      margin-bottom: 32px; 
      border-radius: 12px; 
      padding: 16px; 
      border: 1px solid var(--sys-surface-border); 
      background-color: rgba(255, 255, 255, 0.02); /* Subtle tint */ 
      transition: background-color 0.2s; 
    } 
    .cdk-drop-list-dragging .swimlane:hover { 
      background: var(--sys-hover); 
      border-color: var(--sys-primary); 
    } 
    .swimlane-header { 
      display: flex; 
      align-items: center; 
      gap: 12px; 
      margin-bottom: 16px; 
      color: var(--sys-text-secondary); 
    } 
    .swimlane-title { 
      font-size: 1.1rem; 
      font-weight: 500; 
      letter-spacing: 0.5px; 
      text-transform: uppercase; 
    } 
    .swimlane-count { 
      background-color: var(--sys-surface-border); 
      color: var(--sys-text-secondary); 
      padding: 2px 8px; 
      border-radius: 12px; 
      font-size: 0.75rem; 
      font-weight: bold; 
    } 
    .widget-flow-container { 
      display: flex; 
      flex-wrap: wrap; 
      gap: 24px; 
      align-items: stretch; 
      min-height: 150px; 
    } 
    .widget-wrapper { 
      position: relative; 
      flex-basis: 100%; 
      min-width: 0; 
      transition: flex-basis 0.2s ease; 
      cursor: default; /* Default cursor for read-mode */ 
    } 
    /* Drag handles active only in edit mode via class binding logic if needed, but CDK handles events */ 
    .widget-wrapper.draggable { cursor: grab; } 
    .widget-wrapper.draggable:active { cursor: grabbing; } 
    
    .h-1 { height: 150px; } 
    .h-2 { height: 320px; } 
    .h-3 { height: 490px; } 
    .h-4 { height: 660px; } 

    /* CDK Drag Styles */ 
    .cdk-drag-preview { 
      box-sizing: border-box; 
      border-radius: 8px; 
      box-shadow: 0 5px 15px -3px rgba(0, 0, 0, 0.2); 
      background-color: var(--sys-surface); 
      opacity: 0.9; 
      z-index: 9999 !important; 
    } 
    .cdk-drag-placeholder { 
      opacity: 0.3; 
      background: var(--sys-surface-border); 
      border: 2px dashed var(--sys-text-secondary); 
      border-radius: 8px; 
    } 
    .cdk-drag-animating { 
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1); 
    } 
    .widget-flow-container.cdk-drop-list-dragging .widget-wrapper:not(.cdk-drag-placeholder) { 
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1); 
    } 

    /* --- Focus Overlay --- */ 
    .focus-overlay { 
      position: fixed; 
      inset: 0; 
      z-index: 10000; 
      background-color: rgba(0, 0, 0, 0.7); 
      backdrop-filter: blur(4px); 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      padding: 32px; 
      animation: fadeIn 0.2s ease-out; 
    } 
    .focus-container { 
      width: 100%; 
      height: 100%; 
      background-color: var(--sys-background); 
      border-radius: 8px; 
      box-shadow: 0 24px 38px 3px rgba(0,0,0,0.14), 0 9px 46px 8px rgba(0,0,0,0.12), 0 11px 15px -7px rgba(0,0,0,0.2); 
      overflow: hidden; 
      position: relative; 
    } 
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } 

    .empty-state { 
      padding: 64px; 
      text-align: center; 
      color: var(--sys-text-secondary); 
      border: 2px dashed var(--sys-surface-border); 
      border-radius: 12px; 
      background: var(--sys-surface); 
      margin-top: 24px; 
      display: flex; 
      flex-direction: column; 
      justify-content: center; 
      align-items: center; 
      gap: 16px; 
    } 
    .error-container { 
      background-color: #ffebee; 
      color: #b71c1c; 
      padding: 16px; 
      border-radius: 4px; 
      margin-bottom: 24px; 
      display: flex; 
      align-items: center; 
      gap: 12px; 
    } 

    /* --- Skeleton Grid Styles --- */ 
    .ghost-grid { 
      display: flex; 
      flex-wrap: wrap; 
      gap: 24px; 
      padding: 16px; 
    } 
    .ghost-card { 
      border: 1px solid var(--sys-surface-border); 
      border-radius: 8px; 
      background: var(--sys-surface); 
      padding: 8px; /* Inner padding for loader */ 
    } 

    @media (max-width: 768px) { 
      .widget-wrapper { 
        flex-basis: 100% !important; 
        max-width: 100% !important; 
        height: auto !important; 
        min-height: 300px; 
      } 
      .view-port { padding: 8px; } 
      .swimlane { padding: 8px; background: transparent; border: none; } 
      .ghost-card { flex-basis: 100% !important; max-width: 100% !important; } 
      .focus-overlay { padding: 0; } /* Full screen mobile */ 
      .focus-container { border-radius: 0; } 
    } 
  `], 
  template: `
    <app-toolbar></app-toolbar>

    <div class="view-port" cdkDropListGroup>

      <!-- Skeleton Loading State -->
      @if (store.isLoading() && !store.dashboard()) { 
        <div class="ghost-grid" data-testid="skeleton-grid">
          <!-- Render 4 fake cards to simulate content layout -->
          <div class="ghost-card h-2" style="flex-basis: calc(50% - 12px)">
            <app-skeleton-loader variant="metric"></app-skeleton-loader>
          </div>
          <div class="ghost-card h-2" style="flex-basis: calc(50% - 12px)">
            <app-skeleton-loader variant="chart"></app-skeleton-loader>
          </div>
          <div class="ghost-card h-3" style="flex-basis: calc(100% - 12px)">
            <app-skeleton-loader variant="table"></app-skeleton-loader>
          </div>
          <div class="ghost-card h-2" style="flex-basis: calc(33% - 12px)">
            <app-skeleton-loader variant="card"></app-skeleton-loader>
          </div>
        </div>
      } 

      <!-- Error Message -->
      @if (store.error()) { 
        <div class="error-container" data-testid="error-message">
          <mat-icon>error_outline</mat-icon>
          <div>
            <strong>Unable to load dashboard</strong>
            <div class="text-sm mt-1 text-red-800">{{ store.error() }}</div>
          </div>
        </div>
      } 

      <!-- Dashboard Canvas -->
      @if (store.dashboard()) { 
        @for (lane of lanes(); track lane.id) { 
          <section class="swimlane" [attr.data-testid]="'lane-' + lane.id">
            <div class="swimlane-header">
              <mat-icon class="text-gray-400">dns</mat-icon>
              <span class="swimlane-title">{{ lane.name }}</span>
              <span class="swimlane-count">{{ lane.widgets.length }}</span>
            </div>

            <div 
              class="widget-flow-container" 
              cdkDropList
              [cdkDropListDisabled]="!store.isEditMode()" 
              [cdkDropListData]="lane.widgets" 
              (cdkDropListDropped)="dragDropped($event, lane.id)" 
              [id]="'list-' + lane.id" 
            >
              @for (widget of lane.widgets; track widget.id) { 
                <!-- If this widget is focused, we optionally hide it from grid or keep it. Keeping it prevents layout shift. -->
                <div
                  class="widget-wrapper" 
                  [class.draggable]="store.isEditMode()" 
                  [ngStyle]="getFlexStyle(widget)" 
                  [class]="getHeightClass(widget)" 
                  [attr.data-testid]="'widget-wrapper-' + widget.id" 
                  cdkDrag
                  [cdkDragData]="widget" 
                  [cdkDragDisabled]="!store.isEditMode()" 
                >
                  <app-widget
                    [widget]="widget" 
                    class="h-full block" 
                    (edit)="moveOrEditWidget(widget)" 
                    (delete)="confirmDeleteWidget(widget)" 
                    (duplicate)="store.duplicateWidget(widget)" 
                  ></app-widget>
                  <div *cdkDragPlaceholder class="cdk-drag-placeholder" [style.min-height]="'100%'"></div>
                </div>
              } 
            </div>
          </section>
        } 

        @if (store.widgets().length === 0) { 
          <div class="empty-state">
            <mat-icon class="text-6xl mb-4 text-gray-300">dashboard_customize</mat-icon>
            <h3 class="text-lg font-medium text-gray-700">Canvas is Empty</h3>
            <p class="text-sm">Switch to Edit Mode to add widgets.</p>
            
            <!-- Quick Start Action (Only if editable, or instruct to edit) -->
            @if (store.isEditMode()) { 
              <button 
                mat-stroked-button 
                color="primary" 
                (click)="store.createDefaultDashboard()" 
                [disabled]="store.isLoading()" 
              >
                <mat-icon>restore</mat-icon> Create Default Dashboard
              </button>
            } 
          </div>
        } 
      } 
    </div>

    <!-- FOCUS OVERLAY -->
    @if (store.focusedWidget(); as focused) { 
      <div 
        class="focus-overlay" 
        role="dialog" 
        aria-modal="true" 
        aria-label="Focused Widget View" 
        (click)="store.setFocusedWidget(null)" 
      >
        <!-- Stop propagation to prevent overlay click closing -->
        <div class="focus-container" (click)="$event.stopPropagation()">
           <app-widget
             [widget]="focused" 
             class="h-full block" 
             (edit)="moveOrEditWidget(focused)" 
             (delete)="confirmDeleteWidget(focused)" 
             (duplicate)="store.duplicateWidget(focused)" 
           ></app-widget>
        </div>
      </div>
    } 
  `
}) 
export class DashboardLayoutComponent implements OnInit { 
  /** The centralized State Store for the Dashboard. */ 
  public readonly store = inject(DashboardStore); 
  private readonly route = inject(ActivatedRoute); 
  private readonly dashboardApi = inject(DashboardsService); 
  private readonly dialog = inject(MatDialog); 
  private readonly snackBar = inject(MatSnackBar); 

  /** 
   * Computed View Model: Transforms the flat widget list into groupings (Lanes). 
   * Note: This calculation is pure. 
   */ 
  readonly lanes: Signal<DashboardLane[]> = computed(() => { 
    const allWidgets = [...this.store.widgets()]; 
    const groups: Record<string, WidgetResponse[]> = {}; 

    for (const w of allWidgets) { 
      const gName = (w.config['group'] as string) || 'General'; 
      if (!groups[gName]) groups[gName] = []; 
      groups[gName].push(w); 
    } 

    return Object.keys(groups) 
      .sort((a, b) => a === 'General' ? -1 : a.localeCompare(b)) 
      .map(name => ({ 
        name, 
        id: name, 
        widgets: groups[name].sort((a, b) => { 
          const orderA = (a.config['order'] as number) || 0; 
          const orderB = (b.config['order'] as number) || 0; 
          return orderA - orderB; 
        }) 
      })); 
  }); 

  ngOnInit(): void { 
    // Listen for Dashboard ID Change (Switch Dashboards) 
    this.route.paramMap.subscribe(params => { 
      const id = params.get('id'); 
      if (id) { 
        this.store.reset(); 
        this.store.loadDashboard(id); 
      } 
    }); 

    // Listen for Query Params (Sync Global Filters) 
    this.route.queryParamMap.subscribe(qParams => { 
      // Convert ParamMap to Record<string, any> 
      const paramsObj: Record<string, any> = {}; 
      qParams.keys.forEach(key => { 
        paramsObj[key] = qParams.get(key); 
      }); 
      this.store.setGlobalParams(paramsObj); 
    }); 
  } 

  /** 
   * Handles Drop events from CDK Drag-Drop. 
   * Delegates the actual array manipulation and API persistence to the Store. 
   * 
   * @param {CdkDragDrop<WidgetResponse[]>} event - The drop event containing source/target info. 
   * @param {string} targetGroupId - The ID of the lane (group) the item was dropped into. 
   */ 
  dragDropped(event: CdkDragDrop<WidgetResponse[]>, targetGroupId: string): void { 
    // Delegate complex movement logic to the Store Action
    this.store.handleWidgetDrop( 
      event.previousContainer === event.container, 
      targetGroupId, 
      event.previousIndex, 
      event.currentIndex, 
      event.container.data, 
      event.previousContainer.data
    ); 
  } 

  /** 
   * Helper to calculate CSS Flexbox basis based on widget column width configuration. 
   * 
   * @param {WidgetResponse} widget - The widget config. 
   * @returns {Record<string, string>} Style object for bindings. 
   */ 
  getFlexStyle(widget: WidgetResponse): Record<string, string> { 
    const config = widget.config || {}; 
    const cols = Math.max(1, Math.min(12, config['w'] || 6)); 
    const pct = `${(cols / 12) * 100}%`; 
    return { 
      'flex-basis': `calc(${pct} - 12px)`, 
      'max-width': pct
    }; 
  } 

  getHeightClass(widget: WidgetResponse): string { 
    const h = widget.config['h'] || 2; 
    const clamped = Math.max(1, Math.min(4, h)); 
    return `h-${clamped}`; 
  } 

  moveOrEditWidget(widget: WidgetResponse): void { 
    // If focused, temporarily close focus? No, editor opens over it (z-index higher dialog). 
    const dashboardId = this.store.dashboard()?.id; 
    if (!dashboardId) return; 
    const data: WidgetEditorData = { dashboardId, widget }; 
    const ref = this.dialog.open(WidgetEditorDialog, { 
      data, width: '90vw', maxWidth: '1200px', height: '90vh', panelClass: 'no-padding-dialog' 
    }); 
    ref.afterClosed().subscribe(res => { if (res) this.store.loadDashboard(dashboardId); }); 
  } 

  confirmDeleteWidget(widget: WidgetResponse): void { 
    if (!confirm(`Delete "${widget.title}"?`)) return; 
    // Close focus if active
    if (this.store.focusedWidgetId() === widget.id) { 
        this.store.setFocusedWidget(null); 
    } 
    this.store.optimisticRemoveWidget(widget.id); 
    this.dashboardApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(widget.id).subscribe({ 
      error: () => { 
        this.store.optimisticRestoreWidget(widget); 
        this.snackBar.open('Failed to delete.', 'Close'); 
      } 
    }); 
  } 
}