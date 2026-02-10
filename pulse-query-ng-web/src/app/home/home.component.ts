import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { Router, RouterModule } from '@angular/router'; 
import { finalize } from 'rxjs/operators'; 

// Material Imports
import { MatCardModule } from '@angular/material/card'; 
import { MatButtonModule } from '@angular/material/button'; 
import { MatIconModule } from '@angular/material/icon'; 
import { MatMenuModule } from '@angular/material/menu'; 
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'; 
import { MatDialog, MatDialogModule } from '@angular/material/dialog'; 
import { MatTooltipModule } from '@angular/material/tooltip'; 
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar'; 

import { DashboardsService, DashboardResponse } from '../api-client'; 
import { DashboardCreateDialog } from './dashboard-create.dialog'; 
import { AskDataService } from '../global/ask-data.service'; // Needed for "Ask AI" 

/** Home component. */
@Component({ 
  selector: 'app-home', 
  imports: [ 
    CommonModule, 
    RouterModule, 
    MatCardModule, 
    MatButtonModule, 
    MatIconModule, 
    MatMenuModule, 
    MatProgressSpinnerModule, 
    MatDialogModule, 
    MatTooltipModule, 
    MatSnackBarModule
  ], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { display: block; min-height: 100vh; background-color: #f5f5f5; padding: 32px; } 
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; max-width: 1200px; margin-left: auto; margin-right: auto; } 
    .header-text h1 { margin: 0; font-size: 32px; font-weight: 300; color: #333; } 
    .header-text p { margin: 4px 0 0 0; color: #666; } 
    .grid-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; max-width: 1200px; margin: 0 auto; } 
    .dash-card { cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; position: relative; } 
    .dash-card:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.1); } 
    .avatar-placeholder { width: 40px; height: 40px; border-radius: 50%; background-color: #e3f2fd; color: #1976d2; display: flex; align-items: center; justify-content: center; font-weight: bold; } 
    .card-actions-btn { margin-left: auto; color: #757575; } 
    .empty-state { grid-column: 1 / -1; text-align: center; padding: 64px; background: white; border-radius: 8px; border: 2px dashed #e0e0e0; color: #757575; display: flex; flex-direction: column; align-items: center; gap: 16px; } 
    .loading-container { display: flex; justify-content: center; padding-top: 64px; } 
    .btn-group { display: flex; gap: 12px; } 
  `], 
    templateUrl: './home.component.html'
}) 
export class HomeComponent implements OnInit { 
    /** dashboardsApi property. */
private readonly dashboardsApi = inject(DashboardsService); 
    /** dialog property. */
private readonly dialog = inject(MatDialog); 
    /** router property. */
private readonly router = inject(Router); 
    /** snackBar property. */
private readonly snackBar = inject(MatSnackBar); 
  
  // Public for template access
  /** Ask Data Service. */
  public readonly askDataService = inject(AskDataService); 

  /** Dashboards. */
  readonly dashboards = signal<DashboardResponse[]>([]); 
  /** Whether loading. */
  readonly isLoading = signal(true); 
  /** Whether restoring. */
  readonly isRestoring = signal(false); 

  /** Ng On Init. */
  ngOnInit(): void { 
    this.loadDashboards(); 
  } 

  /** Loads dashboards. */
  loadDashboards(): void { 
    this.isLoading.set(true); 
    this.dashboardsApi.listDashboardsApiV1DashboardsGet() 
      .pipe(finalize(() => this.isLoading.set(false))) 
      .subscribe({ 
        next: (data) => this.dashboards.set(data), 
        error: (err) => { 
          console.error(err); 
          this.snackBar.open('Failed to load dashboards', 'Retry', { duration: 5000 }) 
            .onAction().subscribe(() => this.loadDashboards()); 
        } 
      }); 
  } 

  /** Open Create Dialog. */
  openCreateDialog(): void { 
    const dialogRef = this.dialog.open(DashboardCreateDialog, { 
      width: '400px', 
      autoFocus: 'first-tabbable' 
    }); 

    dialogRef.afterClosed().subscribe((result: DashboardResponse | undefined) => { 
      if (result) { 
        this.dashboards.update(current => [...current, result]); 
        this.router.navigate(['/dashboard', result.id]); 
      } 
    }); 
  } 

  /** Restore Defaults. */
  restoreDefaults(): void { 
    this.isRestoring.set(true); 
    this.dashboardsApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost() 
      .pipe(finalize(() => this.isRestoring.set(false))) 
      .subscribe({ 
        next: (newDash: DashboardResponse) => { 
          this.dashboards.update(curr => [newDash, ...curr]); 
          this.router.navigate(['/dashboard', newDash.id]); 
          this.snackBar.open('Default dashboard created.', 'Close', { duration: 3000 }); 
        }, 
        error: (err) => { 
          console.error(err); 
          this.snackBar.open('Failed to restore defaults.', 'Close'); 
        } 
      }); 
  } 

  /** Rename Dashboard. */
  renameDashboard(dash: DashboardResponse): void { 
    const newName = window.prompt("Enter new dashboard name:", dash.name); 

    if (newName && newName.trim() !== "" && newName !== dash.name) { 
      const originalName = dash.name; 

      this.dashboards.update(items =>
        items.map(d => d.id === dash.id ? { ...d, name: newName } : d) 
      ); 

      this.dashboardsApi.updateDashboardApiV1DashboardsDashboardIdPut(dash.id, { name: newName }) 
        .subscribe({ 
          error: (err) => { 
            console.error(err); 
            this.dashboards.update(items =>
              items.map(d => d.id === dash.id ? { ...d, name: originalName } : d) 
            ); 
            this.snackBar.open(`Rename failed for "${originalName}". Reverted changes.`, 'Close', { duration: 5000 }); 
          } 
        }); 
    } 
  } 

  /** Clone Dashboard. */
  cloneDashboard(dash: DashboardResponse): void { 
    this.dashboardsApi.cloneDashboardApiV1DashboardsDashboardIdClonePost(dash.id) 
      .subscribe({ 
        next: (clonedDash: DashboardResponse) => { 
          this.dashboards.update(curr => [...curr, clonedDash]); 
          this.snackBar.open(`Cloned "${dash.name}" successfully`, 'Close', { duration: 3000 }); 
        }, 
        error: (err) => { 
          console.error(err); 
          this.snackBar.open(`Failed to clone "${dash.name}".`, 'Close', { duration: 5000 }); 
        } 
      }); 
  } 

  /** Deletes dashboard. */
  deleteDashboard(dash: DashboardResponse): void { 
    if (window.confirm(`Are you sure you want to delete "${dash.name}"? This cannot be undone.`)) { 

      const originalList = this.dashboards(); 
      this.dashboards.update(items => items.filter(d => d.id !== dash.id)); 

      this.dashboardsApi.deleteDashboardApiV1DashboardsDashboardIdDelete(dash.id) 
        .subscribe({ 
          error: (err) => { 
            console.error(err); 
            this.dashboards.set(originalList); 
            this.snackBar.open(`Failed to delete "${dash.name}". Restored item.`, 'Close', { duration: 5000 }); 
          } 
        }); 
    } 
  } 
}