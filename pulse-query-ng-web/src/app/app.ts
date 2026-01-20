/**
 * @fileoverview Root Application Component.
 *
 * Acts as the main Layout Shell for the application.
 * - Wraps the content in a `mat-sidenav-container` to support global drawers.
 * - Manages the "Ask Data" right-side drawer visibility.
 * - **TV Mode**: Listens for `?mode=tv` to enable Kiosk state.
 */

import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet, ActivatedRoute } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { AskDataComponent } from './global/ask-data.component';
import { AskDataService } from './global/ask-data.service';
import { ThemeService } from './core/theme/theme.service';

/**
 * The Root Component class.
 *
 * **Accessibility Note:**
 * The `mat-sidenav` serves as a complementary region to the main content.
 * It is labeled "Ask Data Assistant" to provide context to screen readers.
 *
 * **Styling:**
 * Uses CSS variables (defined in global styles) to support theming (Light/Dark modes).
 *
 * @class
 */
@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    MatSidenavModule,
    AskDataComponent
  ],
  template: `
    <mat-sidenav-container class="h-full-container" autosize>
      
      <!-- Side Drawer (Right aligned) -->
      <!-- 
        Accessibility: 
        - role="region" implicit in mat-sidenav but augmented with specific label. 
        - (closed) event ensures internal state signal remains in sync with UI state. 
      -->
      <mat-sidenav 
        #sidenav
        mode="over" 
        position="end" 
        [opened]="askData.isOpen()" 
        (closed)="askData.close()" 
        aria-label="Ask Data Assistant" 
        class="search-drawer" 
      >
        <!-- The Content of the Sidebar -->
        <app-ask-data></app-ask-data>
      </mat-sidenav>

      <!-- Main Content Area -->
      <mat-sidenav-content role="main">
        <router-outlet></router-outlet>
      </mat-sidenav-content>

    </mat-sidenav-container>
  `,
  styles: [`
    :host {
      display: block;
      height: 100vh;
      overflow: hidden;
    }
    /* Container fills viewport and adapts to theme background */
    .h-full-container {
      height: 100%;
      background-color: var(--sys-background);
      color: var(--sys-text-primary);
    }
    /* Drawer styling with border for high contrast separation */
    .search-drawer {
      width: 90vw;
      max-width: 600px;
      border-left: 1px solid var(--sys-surface-border);
      background-color: var(--sys-surface);
    }
  `]
})
export class App implements OnInit {
  /**
   * Service controlling the visibility state of the side drawer.
   * Bound to the `[opened]` property of the sidenav.
   *
   * @readonly
   */
  readonly askData = inject(AskDataService);
  private readonly themeService = inject(ThemeService);
  private readonly route = inject(ActivatedRoute);

  ngOnInit(): void {
    // Global listener for Kiosk Mode parameter
    this.route.queryParams.subscribe(params => {
      if (params['mode'] === 'tv') {
        this.themeService.setTvMode(true);
      }
    });
  }
}