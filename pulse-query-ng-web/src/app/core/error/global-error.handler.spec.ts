/** 
 * @fileoverview Unit tests for GlobalErrorHandler. 
 */ 

import { TestBed } from '@angular/core/testing'; 
import { GlobalErrorHandler } from './global-error.handler'; 
import { MatSnackBar } from '@angular/material/snack-bar'; 
import { Injector } from '@angular/core'; 
import { HttpErrorResponse } from '@angular/common/http'; 
import { of } from 'rxjs'; 

describe('GlobalErrorHandler', () => { 
  let handler: GlobalErrorHandler; 
  let mockSnackBar: { open: ReturnType<typeof vi.fn> }; 
  
  // Spy on console to keep test output clean from expected error logs
  let consoleSpy: any; 

  beforeEach(() => { 
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); 

    // Setup default mock return value to prevent "Cannot read properties of undefined (reading 'onAction')" 
    const snackRefObj = { onAction: () => of(void 0) }; 
    mockSnackBar = { open: vi.fn().mockReturnValue(snackRefObj) }; 
    
    TestBed.configureTestingModule({ 
      providers: [ 
        GlobalErrorHandler, 
        { provide: MatSnackBar, useValue: mockSnackBar }, 
        Injector
      ] 
    }); 

    handler = TestBed.inject(GlobalErrorHandler); 
  }); 

  afterEach(() => { 
    consoleSpy.mockRestore(); 
  }); 

  it('should be created', () => { 
    expect(handler).toBeTruthy(); 
  }); 

  it('should display snackbar for client-side errors', () => { 
    const error = new Error('Client logic failure'); 
    
    handler.handleError(error); 

    expect(mockSnackBar.open).toHaveBeenCalledWith( 
      'Application Error: Client logic failure', 
      'Reload', 
      expect.objectContaining({ 
        politeness: 'assertive', 
        panelClass: ['snackbar-critical'] 
      }) 
    ); 
  }); 

  it('should ignore HttpErrorResponse (handled by interceptor)', () => { 
    const httpError = new HttpErrorResponse({ status: 500 }); 
    handler.handleError(httpError); 
    expect(mockSnackBar.open).not.toHaveBeenCalled(); 
  }); 

  it('should handle string errors', () => { 
    handler.handleError('Simple string error'); 
    
    expect(mockSnackBar.open).toHaveBeenCalledWith( 
      expect.stringMatching(/Simple string error/), 
      expect.anything(), 
      expect.anything() 
    ); 
  }); 

  it('should broadcast error to errors$ stream', () => { 
    const error = new Error('Stream Test'); 
    
    // Subscribe to test emission
    let emitted: unknown; 
    handler.errors$.subscribe(e => emitted = e); 

    handler.handleError(error); 
    expect(emitted).toBe(error); 
  }); 
});