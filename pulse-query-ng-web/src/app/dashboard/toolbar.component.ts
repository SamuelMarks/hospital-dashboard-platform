/** 
 * @fileoverview Application Toolbar. 
 * 
 * Contains Global Navigation, Action Buttons (Add Widget, Theme Toggle), 
 * and User Profile management. 
 */ 

import { Component, inject, ChangeDetectionStrategy } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { Router, RouterModule } from '@angular/router'; 
import { FormsModule } from '@angular/forms'; 

// Material Imports
import { MatToolbarModule } from '@angular/material/toolbar'; 
import { MatButtonModule } from '@angular/material/button'; 
import { MatIconModule } from '@angular/material/icon'; 
import { MatTooltipModule } from '@angular/material/tooltip'; 
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'; 
import { MatMenuModule } from '@angular/material/menu'; 
import { MatDividerModule } from '@angular/material/divider'; 
import { MatDialog } from '@angular/material/dialog'; 
import { MatFormFieldModule } from '@angular/material/form-field'; 
import { MatSelectModule } from '@angular/material/select'; 
import { MatInputModule } from '@angular/material/input'; 

import { AuthService } from '../core/auth/auth.service'; 
import { DashboardStore } from './dashboard.store'; 
import { AskDataService } from '../global/ask-data.service'; 
import { ThemeService } from '../core/theme/theme.service'; 
import { WidgetCreationDialog } from './widget-creation.dialog'; 
import { TemplateWizardComponent } from './template-wizard/template-wizard.component'; 

@Component({ 
  selector: 'app-toolbar', 
  imports: [ 
    CommonModule, 
    RouterModule, 
    FormsModule, 
    MatToolbarModule, 
    MatButtonModule, 
    MatIconModule, 
    MatTooltipModule, 
    MatProgressSpinnerModule, 
    MatMenuModule, 
    MatDividerModule, 
    MatFormFieldModule, 
    MatSelectModule, 
    MatInputModule
  ], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { display: block; position: sticky; top: 0; z-index: 1000; } 
    .toolbar-spacer { flex: 1 1 auto; } 
    .title-group { display: flex; flex-direction: column; line-height: normal; cursor: pointer; } 
    .title-overline { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.7; } 
    .title-main { font-size: 16px; font-weight: 500; } 
    .gap-2 { display: flex; gap: 8px; } 
    .user-avatar { background-color: var(--sys-primary); color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; } 
    .menu-header { padding: 16px; display: flex; flex-direction: column; align-items: center; background-color: var(--sys-background); border-bottom: 1px solid var(--sys-surface-border); } 
    .menu-email { margin-top: 8px; font-weight: 500; color: var(--sys-text-primary); font-size: 14px; } 
    
    .filter-field { font-size: 12px; width: 140px; } 
    ::ng-deep .filter-field .mat-mdc-text-field-wrapper { height: 36px; padding-top: 0; } 
    ::ng-deep .filter-field .mat-mdc-form-field-flex { height: 36px; align-items: center; } 
  `], 
  template: `
    <mat-toolbar color="surface" class="mat-elevation-z2" style="background-color: var(--sys-surface); color: var(--sys-text-primary);">
      <!-- Brand / Home Link -->
      <div 
        class="title-group" 
        routerLink="/" 
        matTooltip="Back to Home" 
        tabindex="0" 
        role="button" 
        (keydown.enter)="router.navigate(['/'])" 
      >
        <span class="title-overline text-primary" style="color: var(--sys-primary);">Analytics</span>
        <span class="title-main">{{ store.dashboard()?.name || 'Loading...' }}</span>
      </div>

      <span class="toolbar-spacer"></span>

      <div class="gap-2 items-center">
        
        <!-- Theme Toggle -->
        <!-- Accessibility: Label describes action -->
        <button 
          mat-icon-button 
          (click)="themeService.toggle()" 
          matTooltip="Toggle Dark Mode" 
          [attr.aria-label]="themeService.isDark() ? 'Switch to Light Mode' : 'Switch to Dark Mode'" 
        >
          <mat-icon>{{ themeService.isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
        </button>

        <span class="border-l h-8 mx-1 border-gray-300"></span>

        <!-- Global Filter -->
        <mat-form-field appearance="outline" class="filter-field" subscriptSizing="dynamic">
          <mat-select 
            placeholder="Department" 
            (selectionChange)="updateFilter('dept', $event.value)" 
            aria-label="Filter by Department" 
          >
            <mat-option [value]="null">All</mat-option>
            <mat-option value="Cardiology">Cardiology</mat-option>
            <mat-option value="Neurology">Neurology</mat-option>
          </mat-select>
        </mat-form-field>

        <button mat-stroked-button color="primary" (click)="askDataService.open()">
          <mat-icon>smart_toy</mat-icon> <span class="hidden sm:inline">Ask AI</span>
        </button>

        <button mat-stroked-button color="accent" (click)="openTemplateWizard()" [disabled]="!store.dashboard()">
          <mat-icon>dynamic_form</mat-icon> <span class="hidden sm:inline">Templates</span>
        </button>

        <button mat-stroked-button (click)="openAddWidgetDialog()" [disabled]="!store.dashboard()">
          <mat-icon>add</mat-icon> <span>Add</span>
        </button>

        <!-- Refresh Action -->
        <!-- Accessibility: Dynamic Label for busy state -->
        <button 
          mat-icon-button 
          color="primary" 
          (click)="store.refreshAll()" 
          [disabled]="store.isLoading()" 
          [attr.aria-label]="store.isLoading() ? 'Refreshing Data' : 'Refresh Dashboard'" 
        >
          @if (store.isLoading()) { <mat-spinner diameter="18"></mat-spinner> } 
          @else { <mat-icon>refresh</mat-icon> } 
        </button>

        <span class="border-l h-8 mx-2 border-gray-300"></span>

        <!-- User Menu -->
        <button 
          mat-icon-button 
          [matMenuTriggerFor]="userMenu" 
          aria-label="User Account Menu" 
        >
          <div class="user-avatar text-xs">{{ userInitials() }}</div>
        </button>

        <mat-menu #userMenu="matMenu">
          <div class="menu-header">
            <mat-icon class="text-4xl mb-2" style="width:40px; height:40px; font-size:40px; color: var(--sys-text-secondary);">account_circle</mat-icon>
            <span class="menu-email">{{ authService.currentUser()?.email }}</span>
          </div>
          <button mat-menu-item routerLink="/"><mat-icon>dashboard</mat-icon><span>My Dashboards</span></button>
          <mat-divider></mat-divider>
          <button mat-menu-item (click)="logout()"><mat-icon color="warn">logout</mat-icon><span>Logout</span></button>
        </mat-menu>

      </div>
    </mat-toolbar>
  `
}) 
export class ToolbarComponent { 
  readonly store = inject(DashboardStore); 
  readonly askDataService = inject(AskDataService); 
  readonly authService = inject(AuthService); 
  readonly themeService = inject(ThemeService); 
  
  // Fix: Correct injection token for Router service
  readonly router = inject(Router); 
  
  private readonly dialog = inject(MatDialog); 

  userInitials(): string { 
    const email = this.authService.currentUser()?.email; 
    return email ? email.substring(0, 2).toUpperCase() : '??'; 
  } 

  logout(): void { this.authService.logout(); } 
  updateFilter(key: string, value: any): void { this.store.updateGlobalParam(key, value); } 

  openAddWidgetDialog(): void { 
    const currentDash = this.store.dashboard(); 
    if (!currentDash) return; 
    const ref = this.dialog.open(WidgetCreationDialog, { 
      data: { dashboardId: currentDash.id }, width: '90vw', maxWidth: '1200px', maxHeight: '95vh', panelClass: 'no-padding-dialog' 
    }); 
    ref.afterClosed().subscribe((res: boolean) => { if (res) this.store.loadDashboard(currentDash.id); }); 
  } 

  openTemplateWizard(): void { 
    const currentDash = this.store.dashboard(); 
    if (!currentDash) return; 
    const ref = this.dialog.open(TemplateWizardComponent, { 
        data: { dashboardId: currentDash.id }, width: '900px', maxHeight: '90vh' 
    }); 
    ref.afterClosed().subscribe((res) => { if (res) this.store.loadDashboard(currentDash.id); }); 
  } 
}