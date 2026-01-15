import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { AuthService } from '../core/auth/auth.service';
import { Router, ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let mockAuthService: any;
  // We use the real Router for testing now, accessed via DI
  let router: Router;

  const originalRegState = environment.registrationEnabled;

  beforeEach(async () => {
    mockAuthService = { login: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [LoginComponent, NoopAnimationsModule],
      providers: [
        // FIX: Provide a functional Router configuration for RouterLink support
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: vi.fn() } } } }
      ]
    }).compileComponents();
    
    router = TestBed.inject(Router);
    // Spy on the real router's navigateByUrl method
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => {
    environment.registrationEnabled = originalRegState;
  });

  const createComponent = () => {
    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('should create', () => {
    createComponent();
    expect(component).toBeTruthy();
  });

  it('should call AuthService and navigate on success', () => {
    createComponent();
    const validCredentials = { email: 'test@example.com', password: 'password123' };
    component.loginForm.setValue(validCredentials);
    mockAuthService.login.mockReturnValue(of({ access_token: 'token', token_type: 'bearer' }));

    component.onSubmit();

    expect(mockAuthService.login).toHaveBeenCalledWith(expect.objectContaining(validCredentials));
    // Verify navigation
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard'); 
  });

  it('should display error message on login failure', () => {
    createComponent();
    const validCredentials = { email: 'test@example.com', password: 'wrong' };
    component.loginForm.setValue(validCredentials);
    
    const errorResponse = new HttpErrorResponse({ 
      error: { detail: 'Bad credentials' }, 
      status: 401
    }); 
    mockAuthService.login.mockReturnValue(throwError(() => errorResponse)); 

    component.onSubmit(); 

    fixture.detectChanges(); 
    const alertBox = fixture.debugElement.query(By.css('[data-testid="error-alert"]')); 
    expect(alertBox.nativeElement.textContent).toContain('Bad credentials'); 
  }); 
});