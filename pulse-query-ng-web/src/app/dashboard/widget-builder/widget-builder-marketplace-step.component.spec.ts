/**
 * @fileoverview Unit tests for `WidgetBuilderMarketplaceStepComponent`.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { WidgetBuilderMarketplaceStepComponent } from './widget-builder-marketplace-step.component';
import { TemplateResponse } from '../../api-client';

describe('WidgetBuilderMarketplaceStepComponent', () => {
  let component: WidgetBuilderMarketplaceStepComponent;
  let fixture: ComponentFixture<WidgetBuilderMarketplaceStepComponent>;

  const mockTemplate: TemplateResponse = {
    id: 't1',
    title: 'Admissions',
    category: 'Operational',
    description: 'Admissions trend',
    sql_template: 'SELECT 1',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WidgetBuilderMarketplaceStepComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WidgetBuilderMarketplaceStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create, render templates, and emit selection and search events', () => {
    expect(component).toBeTruthy();

    fixture.componentRef.setInput('categories', ['Operational', 'Clinical']);
    fixture.componentRef.setInput('selectedCategory', 'Operational');
    fixture.componentRef.setInput('loadingTemplates', true);
    fixture.componentRef.setInput('templates', [mockTemplate]);
    fixture.componentRef.setInput('selectedTemplateId', 't1');
    fixture.detectChanges();

    expect(component.getTemplateAriaLabel(mockTemplate)).toBe(
      'Select template: Admissions - Operational - Admissions trend',
    );
    expect(
      component.getTemplateAriaLabel({
        ...mockTemplate,
        category: '',
        description: undefined,
      }),
    ).toBe('Select template: Admissions -  - ');

    const searchSpy = vi.spyOn(component.searchInput, 'emit');
    const selectSpy = vi.spyOn(component.templateSelect, 'emit');

    const inputEl = (fixture.nativeElement as HTMLElement).querySelector(
      'input',
    ) as HTMLInputElement;
    inputEl.dispatchEvent(new Event('input'));
    expect(searchSpy).toHaveBeenCalled();

    const cardEl = (fixture.nativeElement as HTMLElement).querySelector(
      '.template-card',
    ) as HTMLElement;
    cardEl.click();
    expect(selectSpy).toHaveBeenCalledWith(mockTemplate);

    cardEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    cardEl.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(selectSpy).toHaveBeenCalledTimes(3);
  });
});
