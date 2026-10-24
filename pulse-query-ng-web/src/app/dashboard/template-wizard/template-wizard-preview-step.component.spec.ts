/**
 * @fileoverview Unit tests for `TemplateWizardPreviewStepComponent`.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TemplateWizardPreviewStepComponent } from './template-wizard-preview-step.component';

describe('TemplateWizardPreviewStepComponent', () => {
  let component: TemplateWizardPreviewStepComponent;
  let fixture: ComponentFixture<TemplateWizardPreviewStepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TemplateWizardPreviewStepComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TemplateWizardPreviewStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and highlight SQL syntax', () => {
    expect(component).toBeTruthy();
    expect(component.highlightedSql()).toBeTruthy();

    fixture.componentRef.setInput('finalSql', "SELECT * FROM t WHERE a = 'x' AND b = 5 & c < 10");
    fixture.detectChanges();
    expect(component.highlightedSql()).toBeTruthy();
  });

  it('should render spinner when isRunning is true and render error or table results', () => {
    fixture.componentRef.setInput('isRunning', true);
    fixture.componentRef.setInput('executionResult', { error: 'Bad SQL' });
    fixture.detectChanges();

    const alertEl = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alertEl?.textContent).toContain('Bad SQL');

    fixture.componentRef.setInput('isRunning', false);
    fixture.componentRef.setInput('executionResult', {
      columns: ['col1'],
      data: [{ col1: 42 }],
      error: null,
    });
    fixture.detectChanges();

    expect(component.asTableData({ columns: ['col1'], data: [{ col1: 42 }] })).toEqual({
      columns: ['col1'],
      data: [{ col1: 42 }],
    });
    expect(component.asTableData({})).toEqual({
      columns: [],
      data: [],
    });
  });

  it('should synchronize scroll between textarea and highlight layer', () => {
    const textarea = (fixture.nativeElement as HTMLElement).querySelector(
      '#wizard-generated-sql',
    ) as HTMLTextAreaElement;
    const highlight = (fixture.nativeElement as HTMLElement).querySelector(
      '.highlight-layer',
    ) as HTMLElement;

    textarea.scrollTop = 24;
    textarea.scrollLeft = 12;
    textarea.dispatchEvent(new Event('scroll'));

    expect(highlight.scrollTop).toBe(24);
    expect(highlight.scrollLeft).toBe(12);

    const detachedTextarea = document.createElement('textarea');
    const event = new Event('scroll');
    Object.defineProperty(event, 'target', { value: detachedTextarea });
    component.syncScroll(event);
  });
});
