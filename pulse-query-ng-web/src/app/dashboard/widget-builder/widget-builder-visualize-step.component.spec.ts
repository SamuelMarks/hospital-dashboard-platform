/**
 * @fileoverview Unit tests for `WidgetBuilderVisualizeStepComponent`.
 */

import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { WidgetBuilderVisualizeStepComponent } from './widget-builder-visualize-step.component';
import { WidgetComponent } from '../../widget/widget.component';
import { WidgetResponse } from '../../api-client';

/** Mock widget component for unit testing `WidgetBuilderVisualizeStepComponent`. */
@Component({
  selector: 'app-widget',
  template: '<div data-testid="mock-widget"></div>',
})
class MockWidgetComponent {
  /** Widget input binding. */
  readonly widget = input<WidgetResponse | null>(null);
}

describe('WidgetBuilderVisualizeStepComponent', () => {
  let component: WidgetBuilderVisualizeStepComponent;
  let fixture: ComponentFixture<WidgetBuilderVisualizeStepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WidgetBuilderVisualizeStepComponent],
    })
      .overrideComponent(WidgetBuilderVisualizeStepComponent, {
        remove: { imports: [WidgetComponent] },
        add: { imports: [MockWidgetComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(WidgetBuilderVisualizeStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create, render visualization options and axis controls, and emit changes', () => {
    expect(component).toBeTruthy();

    fixture.componentRef.setInput('title', 'Initial Title');
    fixture.componentRef.setInput('selectedVisualization', 'bar_chart');
    fixture.componentRef.setInput('visualizations', [
      { id: 'table', icon: 'table_chart', label: 'Table' },
      { id: 'bar_chart', icon: 'bar_chart', label: 'Bar Chart' },
    ]);
    fixture.componentRef.setInput('showAxesConfig', true);
    fixture.componentRef.setInput('isPie', false);
    fixture.componentRef.setInput('availableColumns', ['col_a', 'col_b']);
    fixture.componentRef.setInput('previewWidget', {
      id: 'w1',
      dashboard_id: 'd1',
      title: 'Initial Title',
      type: 'SQL',
      visualization: 'bar_chart',
      config: {},
    });
    fixture.detectChanges();

    const titleSpy = vi.spyOn(component.titleChange, 'emit');
    const vizSpy = vi.spyOn(component.vizTypeChange, 'emit');

    const inputEl = (fixture.nativeElement as HTMLElement).querySelector(
      'input',
    ) as HTMLInputElement;
    inputEl.value = 'New Title';
    inputEl.dispatchEvent(new Event('input'));
    expect(titleSpy).toHaveBeenCalledWith('New Title');

    const vizOption = (fixture.nativeElement as HTMLElement).querySelector(
      '.viz-option',
    ) as HTMLElement;
    vizOption.click();
    vizOption.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    vizOption.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(vizSpy).toHaveBeenCalledWith('table');

    fixture.componentRef.setInput('isPie', true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Label Column');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Size Column');
  });
});
