import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatBadgeModule } from '@angular/material/badge';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../core/auth/auth.service';
import { DashboardStore } from './dashboard.store';
import { AskDataService } from '../global/ask-data.service';
import { ThemeService } from '../core/theme/theme.service';
import { WidgetBuilderComponent } from './widget-builder/widget-builder.component';
import { QueryCartService } from '../global/query-cart.service';

/** Toolbar Component. */
@Component({
  selector: 'app-toolbar',
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatDividerModule,
    MatSlideToggleModule,
    MatBadgeModule,
    MatSnackBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toolbar.component.html',
  styles: ['/* See existing styles */'],
})
export class ToolbarComponent {
  /* v8 ignore start */
  public readonly store = inject(DashboardStore);
  public readonly askDataService = inject(AskDataService);
  private readonly cart = inject(QueryCartService);
  public readonly authService = inject(AuthService);
  public readonly themeService = inject(ThemeService);
  public readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  /* v8 ignore stop */

  readonly cartCount = this.cart.count;
  readonly presetColors = ['#1565c0', '#7b1fa2', '#00796b', '#c62828', '#ef6c00'];

  readonly isDashboardRoute = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url.includes('/dashboard/')),
    ),
    { initialValue: false },
  );

  logout(): void {
    this.authService.logout();
  }

  openCart(): void {
    // Logic split based on location context
    if (this.isDashboardRoute() && this.store.dashboard()) {
      if (!this.store.isEditMode()) {
        this.store.toggleEditMode();
      }
    } else {
      // Hint to user if they try to access cart from non-editor screens
      this.snackBar
        .open('Open a dashboard to place items from the cart.', 'Go to Home', { duration: 4000 })
        .onAction()
        .subscribe(() => this.router.navigate(['/']));
    }
  }

  openWidgetBuilder(): void {
    const currentDash = this.store.dashboard();
    if (!currentDash) return;
    const ref = this.dialog.open(WidgetBuilderComponent, {
      data: { dashboardId: currentDash.id },
      width: '1200px',
      maxWidth: '95vw',
      height: '90vh',
      panelClass: 'no-padding-dialog',
      disableClose: true,
    });
    ref.afterClosed().subscribe((res: boolean) => {
      if (res) this.store.loadDashboard(currentDash.id);
    });
  }

  updateTheme(hex: string): void {
    this.themeService.setSeedColor(hex);
  }

  onColorPickerChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value) {
      this.updateTheme(input.value);
    }
  }
}
