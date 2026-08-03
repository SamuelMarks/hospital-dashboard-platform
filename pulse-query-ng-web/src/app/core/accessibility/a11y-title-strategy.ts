/** @docs */
/**
 * @fileoverview Custom accessibility title strategy.
 */

import { Injectable, inject } from '@angular/core';
import { TitleStrategy, RouterStateSnapshot } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { LiveAnnouncer } from '@angular/cdk/a11y';

/**
 * Strategy to update the document title and announce it to screen readers.
 */
@Injectable({ providedIn: 'root' })
export class A11yTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly announcer = inject(LiveAnnouncer);

  /**
   * Updates the document title and announces it via LiveAnnouncer.
   * @param snapshot The current router state snapshot.
   */
  override updateTitle(snapshot: RouterStateSnapshot): void {
    const title = this.buildTitle(snapshot);
    if (title !== undefined) {
      this.title.setTitle(title);
      this.announcer.announce(title, 'polite');
    }
  }
}
