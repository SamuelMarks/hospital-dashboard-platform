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
  let router: Router; 
  let mockRoute: { snapshot: { queryParamMap: { get: ReturnType<typeof vi.fn> } } };

  const originalRegState = environment.registrationEnabled; 

  beforeEach(async () => { 
    // Correctly mock the isAuthenticated signal as a function returning boolean
    mockAuthService = { 
      login: vi.fn(), 
      isAuthenticated: vi.fn().mockReturnValue(false) 
    }; 
    mockRoute = { snapshot: { queryParamMap: { get: vi.fn() } } };

    await TestBed.configureTestingModule({ 
      imports: [LoginComponent, NoopAnimationsModule], 
      providers: [ 
        provideRouter([]), 
        { provide: AuthService, useValue: mockAuthService }, 
        { provide: ActivatedRoute, useValue: mockRoute } 
      ] 
    }).compileComponents(); 
    
    router = TestBed.inject(Router); 
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
    // Defaults to root '/' if no returnUrl present
    expect(router.navigateByUrl).toHaveBeenCalledWith('/'); 
  }); 

  it('should redirect to returnUrl when provided', () => {
    mockRoute.snapshot.queryParamMap.get.mockReturnValue('/dashboard/1');
    createComponent();
    component.loginForm.setValue({ email: 'a@b.com', password: 'pass123' });
    mockAuthService.login.mockReturnValue(of({ access_token: 'token', token_type: 'bearer' }));

    component.onSubmit();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/1');
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

  it('should use fallback error message when detail is missing', () => {
    createComponent();
    component.loginForm.setValue({ email: 'test@example.com', password: 'wrong' });
    mockAuthService.login.mockReturnValue(throwError(() => ({ error: {} })));

    component.onSubmit();

    expect(component.errorMessage()).toContain('Invalid email or password');
  });

  it('should mark form as touched when invalid', () => {
    createComponent();
    const spy = vi.spyOn(component.loginForm, 'markAllAsTouched');
    component.onSubmit();
    expect(spy).toHaveBeenCalled();
  });

  it('should toggle password visibility', () => {
    createComponent();
    const initial = component.hidePassword();
    component.togglePasswordVisibility(new Event('click'));
    expect(component.hidePassword()).toBe(!initial);
  });

  it('should redirect if already authenticated on init', () => {
    mockAuthService.isAuthenticated.mockReturnValue(true);
    createComponent();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });
}); 
