/* v8 ignore start */
/** @docs */
/**
 * @fileoverview Root Application Component.
 *
 * Acts as the main Layout Shell for the application.
 * - Wraps the content in a `mat-sidenav-container` to support global drawers.
 * - **NEW**: Hosts the Global `ToolbarComponent` for consistent navigation and logout.
 * - Manages the "Ask Data" right-side drawer visibility.
 * - **TV Mode**: Listens for `?mode=tv` to enable Kiosk state.
 */

import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet, ActivatedRoute } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { AskDataComponent } from './global/ask-data.component';
import { AskDataService } from './global/ask-data.service';
import { ThemeService } from './core/theme/theme.service';
import { ToolbarComponent } from './dashboard/toolbar.component';

/**
 * The Root Component class.
 *
 * **Accessibility Note:**
 * The `mat-sidenav` serves as a complementary region to the main content.
 * It is labeled "Ask Data Assistant" to provide context to screen readers.
 *
 * **Layout:**
 * Uses a flex-column layout in `mat-sidenav-content` to position the Toolbar
 * at the top and the RouterOutlet filling the remaining space using `flex-grow`.
 *
 * @class
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatSidenavModule, AskDataComponent, ToolbarComponent],
  templateUrl: './app.html',
  styles: [
    `
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
      /* Flex layout for Toolbar + Content */
      .main-content-layout {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }
      .global-toolbar {
        flex-shrink: 0;
        z-index: 1000;
      }
      .page-container {
        flex-grow: 1;
        overflow: hidden;
        position: relative;
        display: flex;
        flex-direction: column;
      }
      /* Drawer styling with border for high contrast separation */
      .search-drawer {
        width: 90vw;
        max-width: 600px;
        border-left: 1px solid var(--sys-surface-border);
        background-color: var(--sys-surface);
      }
    `,
  ],
})
/** @docs */
export class App implements OnInit {
  /**
   * Service controlling the visibility state of the side drawer.
   * Bound to the `[opened]` property of the sidenav.
   *
   * @readonly
   */
  readonly askData = inject(AskDataService);
  /** Theme Service. */
  readonly themeService = inject(ThemeService);
  /** route property. */
  private readonly route = inject(ActivatedRoute);

  /** Ng On Init. */
  ngOnInit(): void {
    // Global listener for Kiosk Mode parameter
    this.route.queryParams.subscribe((params) => {
      if (params['mode'] === 'tv') {
        this.themeService.setTvMode(true);
      }
    });
  }
}
