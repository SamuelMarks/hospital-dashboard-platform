import { Injectable, signal, computed } from '@angular/core';

/**
 * Service to manage the visibility state of the Global "Ask Data" sidebar.
 * This acts as a bridge between the Toolbar (trigger) and the Sidebar Component (display).
 */
@Injectable({
  providedIn: 'root'
})
export class AskDataService {
  /** Private mutable signal for open/close state. */
  private _isOpen = signal(false);

  /** Public read-only signal for UI binding. */
  public isOpen = this._isOpen.asReadonly();

  /** 
  * Toggles the visibility state of the sidebar.
  */
  toggle() {
    this._isOpen.update(v => !v);
  }

  /** 
  * Explicitly closes the sidebar.
  */
  close() {
    this._isOpen.set(false);
  }

  /** 
  * Explicitly opens the sidebar.
  */
  open() {
    this._isOpen.set(true);
  }
}