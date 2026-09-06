/**
 * @fileoverview Unit tests for SystemHealthBannerComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { SystemHealthBannerComponent } from './system-health-banner.component';
import { ConnectionStatusService } from '../../core/health/connection-status.service';
import { By } from '@angular/platform-browser';

describe('SystemHealthBannerComponent', () => {
  let fixture: ComponentFixture<SystemHealthBannerComponent>;
  let component: SystemHealthBannerComponent;

  const mockService = {
    isOnline: signal<boolean>(true),
    isBackendReachable: signal<boolean>(true),
    overallStatus: signal<'healthy' | 'degraded' | 'critical' | 'unreachable'>('healthy'),
    reconnectCountdown: signal<number>(0),
    isChecking: signal<boolean>(false),
    isDismissed: signal<boolean>(false),
    checkHealth: vi.fn().mockReturnValue(of(null)),
    openDiagnosticsDialog: vi.fn(),
    dismissWarningBanner: vi.fn(),
  };

  beforeEach(async () => {
    mockService.isOnline.set(true);
    mockService.isBackendReachable.set(true);
    mockService.overallStatus.set('healthy');
    mockService.reconnectCountdown.set(0);
    mockService.isChecking.set(false);
    mockService.isDismissed.set(false);

    await TestBed.configureTestingModule({
      imports: [SystemHealthBannerComponent],
      providers: [{ provide: ConnectionStatusService, useValue: mockService }],
    }).compileComponents();

    fixture = TestBed.createComponent(SystemHealthBannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should not render any banner when system is healthy and online', () => {
    const banners = fixture.debugElement.queryAll(By.css('.health-banner'));
    expect(banners.length).toBe(0);
  });

  it('should render offline banner when isOnline is false', () => {
    mockService.isOnline.set(false);
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.banner-offline'));
    expect(banner).toBeTruthy();
    expect(banner.nativeElement.textContent).toContain('No Internet Connection');
  });

  it('should render unreachable banner with retry button when backend unreachable', () => {
    mockService.isBackendReachable.set(false);
    mockService.reconnectCountdown.set(5);
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.banner-unreachable'));
    expect(banner).toBeTruthy();
    expect(banner.nativeElement.textContent).toContain('Backend Inaccessible');
    expect(banner.nativeElement.textContent).toContain('Auto-retrying in 5s');

    component.retryNow();
    expect(mockService.checkHealth).toHaveBeenCalled();

    component.openTroubleshoot();
    expect(mockService.openDiagnosticsDialog).toHaveBeenCalled();
  });

  it('should render critical banner when database is misconfigured', () => {
    mockService.overallStatus.set('critical');
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.banner-critical'));
    expect(banner).toBeTruthy();
    expect(banner.nativeElement.textContent).toContain('Database Misconfiguration');
  });

  it('should render degraded banner and handle dismiss', () => {
    mockService.overallStatus.set('degraded');
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.banner-degraded'));
    expect(banner).toBeTruthy();
    expect(banner.nativeElement.textContent).toContain('System Notice');

    component.dismiss();
    expect(mockService.dismissWarningBanner).toHaveBeenCalled();
  });
});
