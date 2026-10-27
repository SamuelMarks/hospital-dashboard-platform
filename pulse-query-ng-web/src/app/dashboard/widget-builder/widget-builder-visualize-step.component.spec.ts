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

    // Test natural-text toggle, processor options, and prompt inputs
    fixture.componentRef.setInput('processors', [
      {
        id: 'ollama:llama3',
        name: 'Llama 3',
        provider: 'ollama',
        isLocal: true,
        category: 'OLLAMA',
      },
      {
        id: 'openai:gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        isLocal: false,
        category: 'ANY_LLM',
      },
    ]);
    fixture.componentRef.setInput('allowNaturalText', true);
    fixture.detectChanges();

    expect(component.sqlOptions().length).toBe(1);
    expect(component.ollamaOptions().length).toBe(1);
    expect(component.anyLlmOptions().length).toBe(1);

    const promptSpy = vi.spyOn(component.naturalTextPromptChange, 'emit');
    const placeholderSpy = vi.spyOn(component.placeholderTextChange, 'emit');
    const promptInput = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="input-natural-text-prompt"]',
    ) as HTMLInputElement;
    promptInput.value = 'Count admissions';
    promptInput.dispatchEvent(new Event('input'));
    expect(promptSpy).toHaveBeenCalledWith('Count admissions');

    const placeholderInput = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="input-placeholder-text"]',
    ) as HTMLInputElement;
    placeholderInput.value = 'Ask here...';
    placeholderInput.dispatchEvent(new Event('input'));
    expect(placeholderSpy).toHaveBeenCalledWith('Ask here...');
  });
});
