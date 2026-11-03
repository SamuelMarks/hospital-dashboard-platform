/**
 * @fileoverview Service managing the open/close visibility state and pending SQL handoff of the global Ask Data sidebar.
 */
import { DOCUMENT } from '@angular/common';
import { Service, inject, signal } from '@angular/core';

/**
 * Service to manage the visibility state of the Global "Ask Data" sidebar.
 * This acts as a bridge between the Toolbar or Chat interface (trigger) and the Sidebar Component (display).
 */
@Service()
export class AskDataService {
  /** Injected DOM document reference for focus restoration. */
  private readonly document = inject(DOCUMENT);
  /** Element that held focus before the Ask Data sidebar was opened. */
  private triggerElement: HTMLElement | null = null;
  /** Private mutable signal for open/close state. */
  private _isOpen = signal(false);
  /** Private mutable signal holding a SQL query string handed off from Chat or external callers. */
  private _pendingSql = signal<string | null>(null);

  /** Public read-only signal for UI binding. */
  public isOpen = this._isOpen.asReadonly();
  /** Public read-only signal exposing the pending SQL query string for the scratchpad builder. */
  public readonly pendingSql = this._pendingSql.asReadonly();

  /**
   * Toggles the visibility state of the sidebar, capturing or restoring trigger focus.
   */
  toggle(): void {
    if (this._isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Explicitly closes the sidebar and restores focus to the trigger element.
   */
  close(): void {
    this._isOpen.set(false);
    this.restoreFocus();
  }

  /**
   * Explicitly opens the sidebar and captures the currently focused trigger element.
   *
   * @param trigger - Optional explicit trigger element to restore focus to on close.
   */
  open(trigger?: HTMLElement | null): void {
    if (trigger !== undefined) {
      this.triggerElement = trigger;
    } else {
      const active = this.document.activeElement;
      this.triggerElement = active instanceof HTMLElement ? active : null;
    }
    this._isOpen.set(true);
  }

  /**
   * Opens the Ask Data scratchpad drawer pre-populated with a specific SQL query.
   *
   * @param sql - The SQL query string to load into the scratchpad SQL editor.
   * @param trigger - Optional trigger element for focus restoration.
   */
  openWithSql(sql: string, trigger?: HTMLElement | null): void {
    const trimmed = sql.trim();
    if (trimmed) {
      this._pendingSql.set(trimmed);
    }
    this.open(trigger);
  }

  /**
   * Restores focus to the saved trigger element if available.
   */
  restoreFocus(): void {
    if (this.triggerElement && typeof this.triggerElement.focus === 'function') {
      this.triggerElement.focus();
      this.triggerElement = null;
    }
  }
}
