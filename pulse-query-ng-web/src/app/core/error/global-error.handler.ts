/** 
 * @fileoverview Global Error Handler Strategy & Bus. 
 * Replaces Angular's default ErrorHandler to intercept unhandled exceptions
 * and present a unified UI notification via Material SnackBar. 
 */ 

import { ErrorHandler, Injectable, Injector, inject } from '@angular/core'; 
import { MatSnackBar } from '@angular/material/snack-bar'; 
import { HttpErrorResponse } from '@angular/common/http'; 
import { BehaviorSubject } from 'rxjs'; 

/** 
 * Global Error Handler implementation. 
 * 
 * **Updates:** 
 * - Acts as an Observable Bus via `errors$`. Components (like `app-widget`) can subscribe
 *   to `errors$` to see if *they* crashed, or simply observe generic app crashes. 
 * - Filters specific "Recoverable" messages vs "Fatal" ones. 
 * - Removed `NgZone` usage as the application is now Zoneless. 
 */ 
@Injectable({ 
  providedIn: 'root' 
}) 
export class GlobalErrorHandler implements ErrorHandler { 
  private readonly injector = inject(Injector); 

  /** 
   * Reactive stream of errors happened in the app. 
   * Subscribers can analyze the stack trace or type to determine if it affects them. 
   */ 
  readonly errors$ = new BehaviorSubject<unknown>(null); 

  /** 
   * Main interception method called by Angular when an exception is thrown. 
   * 
   * @param {unknown} error - The caught exception. 
   */ 
  handleError(error: unknown): void { 
    // 1. Log mechanics (kept for debugging, but could be replaced by a logging service) 
    console.error('Captured Global Error:', error); 
    
    // 2. Broadcast for Boundaries or specialized listeners
    this.errors$.next(error); 

    // 3. HTTP Filter (Handled by Interceptor usually, but acts as a safetynet here) 
    const isHttp = error instanceof HttpErrorResponse || 
      (error && typeof error === 'object' && 'rejection' in error && (error as any)['rejection'] instanceof HttpErrorResponse); 

    if (isHttp) return; 

    // 4. UI Feedback (SnackBar) for Uncaught Runtime Errors (e.g. TypeError, ReferenceError) 
    const snackBar = this.injector.get(MatSnackBar); 
    const message = this.extractMessage(error); 

    // In a Zoneless environment, we can trigger UI updates directly without NgZone.run()
    snackBar.open(`Application Error: ${message}`, 'Reload', { 
      duration: 8000, 
      // Accessibility: 'assertive' ensures screen readers announce the crash immediately. 
      politeness: 'assertive', 
      panelClass: ['snackbar-critical'] 
    }).onAction().subscribe(() => this.reloadApp()); 
  } 

  private reloadApp(): void {
    try {
      window.location.reload();
    } catch {
      // Ignore reload errors in non-browser environments (e.g., tests).
    }
  }

  /** 
   * Manually clears the error stream (e.g., after a Retry action matches a successful recovery). 
   */ 
  clearError(): void { 
    this.errors$.next(null); 
  } 

  /** 
   * Helper to parse unknown error objects into human-readable strings. 
   * 
   * @param {unknown} error - The raw error object. 
   * @returns {string} The extracted message string. 
   */ 
  private extractMessage(error: unknown): string { 
    if (error instanceof Error) return error.message; 
    if (typeof error === 'string') return error; 
    // Handle Promise rejections
    if (error && typeof error === 'object' && 'rejection' in error) return this.extractMessage((error as any).rejection); 
    return 'Unknown runtime exception'; 
  } 
}
