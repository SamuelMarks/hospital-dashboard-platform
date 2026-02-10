import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RegisterComponent, passwordMatchValidator } from './register.component';
import { AuthService } from '../core/auth/auth.service';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { FormControl, FormGroup } from '@angular/forms';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let mockAuthService: any;
  let router: Router;

  beforeEach(async () => {
    mockAuthService = { register: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [RegisterComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]), // FIX: Provide actual router configuration
        { provide: AuthService, useValue: mockAuthService }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    // Mock the navigate method to check calls
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should validate matching passwords', () => {
    const form = component.registerForm;
    form.patchValue({ 
      email: 'test@test.com', 
      password: 'pass', 
      confirmPassword: 'wrong' 
    });
    
    form.updateValueAndValidity();
    
    expect(form.hasError('mismatch')).toBe(true);
    
    form.patchValue({ confirmPassword: 'pass' });
    form.updateValueAndValidity();

    expect(form.hasError('mismatch')).toBe(false);
    expect(form.valid).toBe(true);
  });

  it('should call authService.register on submit', () => {
    mockAuthService.register.mockReturnValue(of({ access_token: 'abc', token_type: 'bearer' }));
    
    component.registerForm.setValue({ 
      email: 'new@user.com', 
      password: 'strongPassword', 
      confirmPassword: 'strongPassword' 
    });

    component.onSubmit();
    
    expect(component.isLoading()).toBe(false);

    expect(mockAuthService.register).toHaveBeenCalledWith({ email: 'new@user.com', password: 'strongPassword' });
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('should display error on API failure', () => {
    mockAuthService.register.mockReturnValue(throwError(() => ({ error: { detail: 'Email already exists' } })));
    
    component.registerForm.setValue({ 
      email: 'taken@user.com', 
      password: 'pass', 
      confirmPassword: 'pass' 
    });

    component.onSubmit();

    expect(component.errorMessage()).toBe('Email already exists');
    fixture.detectChanges();
    
    const alert = fixture.debugElement.query(By.css('[data-testid="error-alert"]'));
    expect(alert).toBeTruthy();
  });

  it('should use fallback error message when detail is missing', () => {
    mockAuthService.register.mockReturnValue(throwError(() => ({ error: {} })));

    component.registerForm.setValue({
      email: 'taken@user.com',
      password: 'pass',
      confirmPassword: 'pass'
    });

    component.onSubmit();

    expect(component.errorMessage()).toContain('Registration failed');
  });

  it('should mark form as touched when invalid', () => {
    const spy = vi.spyOn(component.registerForm, 'markAllAsTouched');
    component.onSubmit();
    expect(spy).toHaveBeenCalled();
  });

  it('should toggle password visibility', () => {
    const initial = component.hidePassword();
    component.togglePasswordVisibility(new Event('click'));
    expect(component.hidePassword()).toBe(!initial);
  });

  describe('passwordMatchValidator', () => {
    it('should return error if values mismatch', () => {
        const group = new FormGroup({ 
            password: new FormControl('a'), 
            confirmPassword: new FormControl('b') 
        }); 
        const result = passwordMatchValidator(group); 
        expect(result).toEqual({ mismatch: true }); 
    });

    it('should return null if values match', () => {
        const group = new FormGroup({ 
            password: new FormControl('a'), 
            confirmPassword: new FormControl('a') 
        }); 
        const result = passwordMatchValidator(group); 
        expect(result).toBeNull(); 
    }); 

    it('should clear mismatch error when values match', () => {
        const confirmControl = new FormControl('a');
        confirmControl.setErrors({ mismatch: true });
        const group = new FormGroup({
            password: new FormControl('a'),
            confirmPassword: confirmControl
        });

        const result = passwordMatchValidator(group);

        expect(result).toBeNull();
        expect(confirmControl.errors).toBeNull();
    });
  });
});
