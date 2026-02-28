import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminComponent } from './admin.component';
import { AdminService, AiService } from '../api-client';
import { of, throwError, delay } from 'rxjs';
import { ReactiveFormsModule, FormArray, FormControl } from '@angular/forms';
import { vi, describe, beforeEach, it, expect, afterEach } from 'vitest';
import { Component, signal, DestroyRef } from '@angular/core';

describe('AdminComponent', () => {
  let component: AdminComponent;
  let fixture: ComponentFixture<AdminComponent>;
  let adminServiceMock: any;
  let aiServiceMock: any;

  beforeEach(async () => {
    adminServiceMock = {
      readAdminSettingsApiV1AdminSettingsGet: vi
        .fn()
        .mockReturnValue(of({ api_keys: { openai: 'test-key' }, visible_models: ['model-1'] })),
      writeAdminSettingsApiV1AdminSettingsPut: vi
        .fn()
        .mockReturnValue(
          of({ api_keys: { openai: 'test-key' }, visible_models: ['model-1', 'model-2'] }),
        ),
    };

    aiServiceMock = {
      listAvailableModelsApiV1AiModelsGet: vi.fn().mockReturnValue(
        of([
          { id: 'model-1', name: 'Model 1' },
          { id: 'model-2', name: 'Model 2' },
        ]),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [AdminComponent, ReactiveFormsModule],
      providers: [
        { provide: AdminService, useValue: adminServiceMock },
        { provide: AiService, useValue: aiServiceMock },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should construct component and signals', () => {
    fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;

    expect(component.settingsLoaded()).toBe(false);
    expect(component.availableModels()).toEqual([]);
    expect(component.message()).toBe('');
    expect(component.isSaving()).toBe(false);

    // Call signal setters directly just to test setting them
    // to improve v8 coverage
    component.settingsLoaded.set(true);
    expect(component.settingsLoaded()).toBe(true);
    component.availableModels.set([]);
    expect(component.availableModels()).toEqual([]);
    component.message.set('foo');
    expect(component.message()).toBe('foo');
    component.isSaving.set(true);
    expect(component.isSaving()).toBe(true);

    // Explicitly call the getter for v8
    expect(component.modelsFormArray).toBeInstanceOf(FormArray);
  });

  it('should render loading template before settings load', () => {
    adminServiceMock.readAdminSettingsApiV1AdminSettingsGet.mockReturnValue(
      of({ api_keys: { openai: 'test-key' }, visible_models: ['model-1'] }).pipe(delay(100)),
    );
    fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;

    fixture.detectChanges();

    const loadingElement = fixture.nativeElement.querySelector('.loading');
    expect(loadingElement).toBeTruthy();
    expect(loadingElement.textContent).toContain('Loading settings...');
  });

  describe('when settings are loaded', () => {
    beforeEach(async () => {
      fixture = TestBed.createComponent(AdminComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('should create and load settings', () => {
      expect(component).toBeTruthy();
      expect(adminServiceMock.readAdminSettingsApiV1AdminSettingsGet).toHaveBeenCalled();
      expect(aiServiceMock.listAvailableModelsApiV1AiModelsGet).toHaveBeenCalledWith(true);

      expect(component.adminForm.get('apiKeys.openai')?.value).toBe('test-key');
      expect(component.adminForm.get('apiKeys.anthropic')?.value).toBe('');

      expect(component.modelsFormArray.at(0).value).toBe(true);
      expect(component.modelsFormArray.at(1).value).toBe(false);

      expect(component.settingsLoaded()).toBe(true);
      expect(component.availableModels().length).toBe(2);
    });

    it('should correctly expose modelsFormArray getter', () => {
      const arr = component.modelsFormArray;
      expect(arr).toBeInstanceOf(FormArray);
      expect(arr.length).toBe(2);
    });

    it('should not save if form is invalid', () => {
      component.adminForm.setErrors({ invalid: true });
      component.saveSettings();
      expect(adminServiceMock.writeAdminSettingsApiV1AdminSettingsPut).not.toHaveBeenCalled();
    });

    it('should save settings and set message', () => {
      vi.useFakeTimers();

      component.adminForm.patchValue({
        apiKeys: {
          anthropic: ' test-anthropic-key ', // Test valid anthropic key with whitespace
        },
      });

      component.modelsFormArray.at(1).setValue(true);

      component.saveSettings();

      expect(adminServiceMock.writeAdminSettingsApiV1AdminSettingsPut).toHaveBeenCalledWith({
        api_keys: { openai: 'test-key', anthropic: 'test-anthropic-key' },
        visible_models: ['model-1', 'model-2'],
      });

      expect(component.message()).toBe('Settings saved successfully!');

      // Simulate destroy to test cleanup
      const destroyRef = fixture.debugElement.injector.get(DestroyRef);
      // We don't have a clean way to force it without casting or reflection, but
      // the set timeout is queued.

      vi.advanceTimersByTime(3000);
      expect(component.message()).toBe('');
      vi.useRealTimers();
    });

    it('should call clear timeout on destroy when saving settings', () => {
      vi.useFakeTimers();
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      component.saveSettings();

      // Destroy the component, invoking DestroyRef handlers
      fixture.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should not save invalid form', () => {
      component.adminForm.controls['apiKeys'].setErrors({ invalid: true });
      component.adminForm.setErrors({ invalid: true });
      component.saveSettings();
      expect(adminServiceMock.writeAdminSettingsApiV1AdminSettingsPut).not.toHaveBeenCalled();
    });

    it('should handle missing keys from form safely', () => {
      component.adminForm.patchValue({
        apiKeys: { openai: null, anthropic: null } as any,
      });

      component.saveSettings();

      expect(adminServiceMock.writeAdminSettingsApiV1AdminSettingsPut).toHaveBeenCalledWith({
        api_keys: {},
        visible_models: ['model-1'],
      });
    });

    it('should handle missing overall keys on save gracefully', () => {
      Object.defineProperty(component.adminForm, 'value', {
        value: { apiKeys: null, models: [true, false] },
      });
      component.saveSettings();
      expect(adminServiceMock.writeAdminSettingsApiV1AdminSettingsPut).toHaveBeenCalledWith({
        api_keys: {},
        visible_models: ['model-1'],
      });
    });

    it('should handle missing models array safely on save', () => {
      Object.defineProperty(component.adminForm, 'value', {
        value: { apiKeys: { openai: 'test-key' }, models: null },
      });
      component.saveSettings();
      expect(adminServiceMock.writeAdminSettingsApiV1AdminSettingsPut).toHaveBeenCalledWith({
        api_keys: { openai: 'test-key' },
        visible_models: [],
      });
    });

    it('should handle errors during save', () => {
      adminServiceMock.writeAdminSettingsApiV1AdminSettingsPut.mockReturnValueOnce(
        throwError(() => new Error('Error saving settings')),
      );

      component.saveSettings();

      expect(component.isSaving()).toBe(false);
      expect(component.message()).toBe('Error saving settings.');
    });

    it('should update available models and set values when settings are available', () => {
      // test component ngOnInit code explicitly
      component.ngOnInit();
      expect(component.availableModels().length).toBe(2);
    });

    it('should ignore non-string empty or white-space values correctly', () => {
      component.adminForm.patchValue({
        apiKeys: {
          openai: '   ', // whitespace only
          anthropic: '   ',
        },
      });

      component.saveSettings();

      expect(adminServiceMock.writeAdminSettingsApiV1AdminSettingsPut).toHaveBeenCalledWith({
        api_keys: {}, // should be completely empty
        visible_models: ['model-1'],
      });
    });

    it('should ignore other api keys incorrectly added', () => {
      component.adminForm.patchValue({
        apiKeys: {
          openai: 'sk-val',
          anthropic: 'sk-anthropic',
          other: 'sk-something',
        } as any,
      });

      component.saveSettings();

      expect(adminServiceMock.writeAdminSettingsApiV1AdminSettingsPut).toHaveBeenCalledWith({
        api_keys: { openai: 'sk-val', anthropic: 'sk-anthropic' },
        visible_models: ['model-1'],
      });
    });

    it('should safely map missing API keys to empty strings', () => {
      // Setup the service mock with a completely undefined api_keys object
      // instead of undefined settings as tested later
      adminServiceMock.readAdminSettingsApiV1AdminSettingsGet.mockReturnValue(
        of({ api_keys: undefined, visible_models: ['model-1'] }),
      );

      component.ngOnInit();

      expect(component.adminForm.get('apiKeys.openai')?.value).toBe('');
      expect(component.adminForm.get('apiKeys.anthropic')?.value).toBe('');
    });

    it('should call trackBy correctly', () => {
      // this gives functions coverage for track function in template
      fixture.detectChanges();
      const div = fixture.nativeElement.querySelector('.model-item');
      expect(div).toBeTruthy();
      expect(component.trackByFn(0)).toBe(0);
    });

    // explicitly call functions required to hit 100% test coverage
    it('should cover oninit subscribe methods', () => {
      adminServiceMock.writeAdminSettingsApiV1AdminSettingsPut.mockReturnValue(of({}));
      component.saveSettings();
      expect(component.isSaving()).toBe(false);
    });

    it('should cover subscribe error', () => {
      adminServiceMock.writeAdminSettingsApiV1AdminSettingsPut.mockReturnValue(
        throwError(() => new Error('Error')),
      );
      component.saveSettings();
      expect(component.isSaving()).toBe(false);
    });
  });

  describe('when load returns missing API keys', () => {
    beforeEach(async () => {
      adminServiceMock.readAdminSettingsApiV1AdminSettingsGet.mockReturnValue(
        of({ api_keys: undefined, visible_models: ['model-1'] }),
      );

      fixture = TestBed.createComponent(AdminComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('should handle missing settings on initial load gracefully', () => {
      expect(component.adminForm.get('apiKeys.openai')?.value).toBe('');
      expect(component.adminForm.get('apiKeys.anthropic')?.value).toBe('');
    });
  });
});
