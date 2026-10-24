/**
 * @fileoverview Unit tests for `WidgetBuilderCustomSourceStepComponent`.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { WidgetBuilderCustomSourceStepComponent } from './widget-builder-custom-source-step.component';

describe('WidgetBuilderCustomSourceStepComponent', () => {
  let component: WidgetBuilderCustomSourceStepComponent;
  let fixture: ComponentFixture<WidgetBuilderCustomSourceStepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WidgetBuilderCustomSourceStepComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WidgetBuilderCustomSourceStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and emit customTypeSelect on click and keyboard events', () => {
    expect(component).toBeTruthy();

    fixture.componentRef.setInput('selectedCustomType', 'SQL');
    fixture.detectChanges();

    const selectSpy = vi.spyOn(component.customTypeSelect, 'emit');
    const options = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.source-option'),
    ) as HTMLElement[];
    expect(options.length).toBe(3);

    const [sqlEl, httpEl, textEl] = options;
    sqlEl?.click();
    sqlEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    sqlEl?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

    httpEl?.click();
    httpEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    httpEl?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

    textEl?.click();
    textEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    textEl?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

    expect(selectSpy).toHaveBeenCalledWith('SQL');
    expect(selectSpy).toHaveBeenCalledWith('HTTP');
    expect(selectSpy).toHaveBeenCalledWith('TEXT');
  });
});
