/**
 * @fileoverview Root Application Component.
 *
 * Acts as the main Layout Shell for the application.
 * - Wraps the content in a `mat-sidenav-container` to support global drawers.
 * - **NEW**: Hosts the Global `ToolbarComponent` for consistent navigation and logout.
 * - Manages the "Ask Data" right-side drawer visibility.
 * - **TV Mode**: Listens for `?mode=tv` to enable Kiosk state.
 */

import { Component, DestroyRef, inject, OnInit, LOCALE_ID } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet, ActivatedRoute } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { DOCUMENT } from '@angular/common';
import { AskDataComponent } from './global/ask-data.component';
import { AskDataService } from './global/ask-data.service';
import { ConnectionStatusService } from './core/health/connection-status.service';
import { ThemeService } from './core/theme/theme.service';
import { ToolbarComponent } from './dashboard/toolbar.component';
import { SystemHealthBannerComponent } from './shared/components/system-health-banner.component';

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
  imports: [
    RouterOutlet,
    MatSidenavModule,
    AskDataComponent,
    ToolbarComponent,
    SystemHealthBannerComponent,
  ],
  templateUrl: './app.html',
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        overflow: hidden;
      }
      .skip-link {
        position: absolute;
        left: -9999px;
        top: 8px;
        z-index: 2000;
        padding: 8px 16px;
        background-color: var(--sys-primary);
        color: var(--sys-on-primary);
        border-radius: 4px;
        text-decoration: none;
        font-weight: 500;
      }
      .skip-link:focus,
      .skip-link:focus-visible {
        left: 8px;
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
export class App implements OnInit {
  /**
   * Service controlling the visibility state of the side drawer.
   * Bound to the `[opened]` property of the sidenav.
   *
   * @readonly
   */
  readonly askData = inject(AskDataService);
  /** Reactive theme service managing light/dark mode and TV kiosk display state. */
  readonly themeService = inject(ThemeService);
  /** Service monitoring backend and database health status. */
  readonly connectionService = inject(ConnectionStatusService);
  /** Activated route reference used to observe global query parameters such as `?mode=tv`. */
  private readonly route = inject(ActivatedRoute);

  /** Document reference for setting the root HTML language attribute. */
  private readonly document = inject(DOCUMENT);
  /** Active Angular locale identifier applied to the document root element. */
  private readonly localeId = inject(LOCALE_ID);
  /** DestroyRef for cleaning up route query parameter subscriptions. */
  private readonly destroyRef = inject(DestroyRef);

  /** Initializes document language, triggers a system health check, and subscribes to TV mode query parameters. */
  ngOnInit(): void {
    this.document.documentElement.lang = this.localeId;

    // Check system and backend health on load
    this.connectionService.checkHealth().subscribe();

    // Global listener for Kiosk Mode parameter
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      if (params['mode'] === 'tv') {
        this.themeService.setTvMode(true);
      }
    });
  }
}
