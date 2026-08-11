import '@angular/localize/init';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RegisterComponent } from './register.component';
import { AuthService } from '../core/auth/auth.service';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { vi } from 'vitest';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let mockAuthService: any;
  let router: Router;

  beforeEach(async () => {
    mockAuthService = { register: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [RegisterComponent, NoopAnimationsModule],
      providers: [provideRouter([]), { provide: AuthService, useValue: mockAuthService }],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should validate matching passwords', () => {
    component.formModel.set({
      email: 'test@test.com',
      password: 'pass',
      confirmPassword: 'wrong',
    });
    fixture.detectChanges();

    expect(
      component.registerForm
        .confirmPassword()
        .errors()
        .some((e) => e.kind === 'mismatch'),
    ).toBe(true);
    expect(component.registerForm().invalid()).toBe(true);

    component.formModel.set({
      email: 'test@test.com',
      password: 'pass',
      confirmPassword: 'pass',
    });
    fixture.detectChanges();

    expect(
      component.registerForm
        .confirmPassword()
        .errors()
        .some((e) => e.kind === 'mismatch'),
    ).toBe(false);
    expect(component.registerForm().valid()).toBe(true);
  });

  it('should call authService.register on submit', () => {
    mockAuthService.register.mockReturnValue(of({ access_token: 'abc', token_type: 'bearer' }));

    component.formModel.set({
      email: 'new@user.com',
      password: 'strongPassword',
      confirmPassword: 'strongPassword',
    });
    fixture.detectChanges();

    component.onSubmit();

    expect(component.isLoading()).toBe(false);

    expect(mockAuthService.register).toHaveBeenCalledWith({
      email: 'new@user.com',
      password: 'strongPassword',
    });
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('should display error on API failure', () => {
    mockAuthService.register.mockReturnValue(
      throwError(() => ({ error: { detail: 'Email already exists' } })),
    );

    component.formModel.set({
      email: 'taken@user.com',
      password: 'pass',
      confirmPassword: 'pass',
    });
    fixture.detectChanges();

    component.onSubmit();

    expect(component.errorMessage()).toBe('Email already exists');
    fixture.detectChanges();

    const alert = fixture.debugElement.query(By.css('[data-testid="error-alert"]'));
    expect(alert).toBeTruthy();
  });

  it('should use fallback error message when detail is missing', () => {
    mockAuthService.register.mockReturnValue(throwError(() => ({ error: {} })));

    component.formModel.set({
      email: 'taken@user.com',
      password: 'pass',
      confirmPassword: 'pass',
    });
    fixture.detectChanges();

    component.onSubmit();

    expect(component.errorMessage()).toContain('Registration failed');
  });

  it('should mark form as touched when invalid', () => {
    // Component starts with empty model which is invalid
    const spy = vi.spyOn(component.registerForm(), 'markAsTouched');
    component.onSubmit();
    expect(spy).toHaveBeenCalled();
  });

  it('should toggle password visibility', () => {
    const initial = component.hidePassword();
    component.togglePasswordVisibility(new Event('click'));
    expect(component.hidePassword()).toBe(!initial);
  });

  it('should toggle password visibility from template button', () => {
    const btn = fixture.debugElement.query(By.css('button[matSuffix]'));
    const initial = component.hidePassword();
    btn.triggerEventHandler('click', new Event('click'));
    expect(component.hidePassword()).toBe(!initial);
  });

  it('should show loading bar when loading', () => {
    component.isLoading.set(true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('[data-testid="loading-bar"]'))).toBeTruthy();
  });

  it('should render login link', () => {
    expect(fixture.debugElement.query(By.css('[data-testid="link-login"]'))).toBeTruthy();
  });
});
