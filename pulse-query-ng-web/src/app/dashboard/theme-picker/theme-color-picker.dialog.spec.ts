/**
 * @fileoverview Unit tests for [ThemeColorPickerDialogComponent].
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import {
  ThemeColorPickerDialogComponent,
  ThemeColorPickerData,
  CLINICAL_PALETTES,
} from './theme-color-picker.dialog';
import { ThemeService } from '../../core/theme/theme.service';

describe('ThemeColorPickerDialogComponent', () => {
  let component: ThemeColorPickerDialogComponent;
  let fixture: ComponentFixture<ThemeColorPickerDialogComponent>;
  let mockThemeService: {
    seedColor: ReturnType<typeof vi.fn>;
    setSeedColor: ReturnType<typeof vi.fn>;
  };
  let mockDialogRef: { close: ReturnType<typeof vi.fn> };
  let mockSnackBar: { open: ReturnType<typeof vi.fn> };
  let mockHttp: { put: ReturnType<typeof vi.fn> };

  const testData: ThemeColorPickerData = {
    dashboardId: 'dash-123',
    dashboardName: 'ICU Census Dashboard',
    currentColor: '#1565C0',
  };

  beforeEach(async () => {
    mockThemeService = {
      seedColor: vi.fn().mockReturnValue('#1565C0'),
      setSeedColor: vi.fn(),
    };
    mockDialogRef = { close: vi.fn() };
    mockSnackBar = { open: vi.fn() };
    mockHttp = { put: vi.fn().mockReturnValue(of({})) };

    await TestBed.configureTestingModule({
      imports: [ThemeColorPickerDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: testData },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: HttpClient, useValue: mockHttp },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ThemeColorPickerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and initialize with provided color and palettes', () => {
    expect(component).toBeTruthy();
    expect(component.selectedColor()).toBe('#1565C0');
    expect(component.palettes.length).toBe(CLINICAL_PALETTES.length);
  });

  it('should select a predefined clinical palette', () => {
    const target = CLINICAL_PALETTES[0]; // Stanford Cardinal
    component.selectPalette(target);

    expect(component.selectedColor()).toBe(target.hex);
    expect(component.customHex).toBe(target.hex);
  });

  it('should handle color picker input event', () => {
    const event = { target: { value: '#00796B' } } as unknown as Event;
    component.onColorPickerInput(event);

    expect(component.selectedColor()).toBe('#00796B');
    expect(component.customHex).toBe('#00796B');
  });

  it('should update selected color on valid hex text input', () => {
    component.customHex = '#7B1FA2';
    component.onHexInputChange();

    expect(component.selectedColor()).toBe('#7B1FA2');
  });

  it('should ignore invalid hex text input', () => {
    component.customHex = 'invalid';
    component.onHexInputChange();

    expect(component.selectedColor()).toBe('#1565C0');
  });

  it('should apply valid theme to session and close dialog', () => {
    component.selectedColor.set('#8C1515');
    component.applyTheme();

    expect(mockThemeService.setSeedColor).toHaveBeenCalledWith('#8C1515');
    expect(mockSnackBar.open).toHaveBeenCalledWith('Theme color applied successfully', 'OK', {
      duration: 2500,
    });
    expect(mockDialogRef.close).toHaveBeenCalledWith({ applied: true, color: '#8C1515' });
  });

  it('should reject applying invalid hex color', () => {
    component.selectedColor.set('invalid');
    component.applyTheme();

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Please specify a valid 6-digit hex color code',
      'Close',
      { duration: 3000 },
    );
    expect(mockThemeService.setSeedColor).not.toHaveBeenCalled();
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  });

  it('should save theme to dashboard via HTTP and close dialog on success', () => {
    component.selectedColor.set('#EF6C00');
    mockHttp.put.mockReturnValue(of({ status: 'ok' }));

    component.saveToDashboard();

    expect(mockThemeService.setSeedColor).toHaveBeenCalledWith('#EF6C00');
    expect(mockHttp.put).toHaveBeenCalledWith('/api/v1/dashboards/dash-123', {
      name: 'ICU Census Dashboard',
    });
    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Dashboard theme color saved permanently',
      'OK',
      { duration: 3000 },
    );
    expect(mockDialogRef.close).toHaveBeenCalledWith({
      applied: true,
      saved: true,
      color: '#EF6C00',
    });
  });

  it('should handle HTTP error when saving theme to dashboard', () => {
    component.selectedColor.set('#EF6C00');
    mockHttp.put.mockReturnValue(throwError(() => new Error('Network error')));

    component.saveToDashboard();

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Theme applied locally (dashboard sync failed)',
      'OK',
      { duration: 3000 },
    );
    expect(mockDialogRef.close).toHaveBeenCalledWith({
      applied: true,
      saved: false,
      color: '#EF6C00',
    });
  });

  it('should reject saving invalid hex color to dashboard', () => {
    component.selectedColor.set('#XYZ');
    component.saveToDashboard();

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Please specify a valid 6-digit hex color code',
      'Close',
      { duration: 3000 },
    );
    expect(mockHttp.put).not.toHaveBeenCalled();
  });

  it('should close dialog when cancel button is invoked', () => {
    component.close();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });

  it('should handle saveToDashboard when dashboardId is not provided', () => {
    // Override data to have no dashboardId
    (component as unknown as { data: ThemeColorPickerData | undefined }).data = undefined;
    component.selectedColor.set('#00796B');

    component.saveToDashboard();

    expect(mockThemeService.setSeedColor).toHaveBeenCalledWith('#00796B');
    expect(mockHttp.put).not.toHaveBeenCalled();
    expect(mockDialogRef.close).toHaveBeenCalledWith({
      applied: true,
      saved: false,
      color: '#00796B',
    });
  });

  it('should ignore color picker input event when value is empty', () => {
    const initial = component.selectedColor();
    const event = { target: { value: '' } } as unknown as Event;
    component.onColorPickerInput(event);

    expect(component.selectedColor()).toBe(initial);
  });

  it('should fallback to themeService.seedColor when currentColor is absent', () => {
    TestBed.resetTestingModule();
    const customMockTheme = {
      seedColor: vi.fn().mockReturnValue('#7B1FA2'),
      setSeedColor: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [ThemeColorPickerDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { dashboardId: 'd1', dashboardName: 'D1' } },
        { provide: ThemeService, useValue: customMockTheme },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: HttpClient, useValue: mockHttp },
      ],
    });

    const customFixture = TestBed.createComponent(ThemeColorPickerDialogComponent);
    const customComp = customFixture.componentInstance;
    expect(customComp.selectedColor()).toBe('#7B1FA2');
  });

  it('should fallback to default hex when both currentColor and seedColor are absent', () => {
    TestBed.resetTestingModule();
    const customMockTheme = {
      seedColor: vi.fn().mockReturnValue(''),
      setSeedColor: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [ThemeColorPickerDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: null },
        { provide: ThemeService, useValue: customMockTheme },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: HttpClient, useValue: mockHttp },
      ],
    });

    const customFixture = TestBed.createComponent(ThemeColorPickerDialogComponent);
    const customComp = customFixture.componentInstance;
    expect(customComp.selectedColor()).toBe('#1565C0');
  });
});
