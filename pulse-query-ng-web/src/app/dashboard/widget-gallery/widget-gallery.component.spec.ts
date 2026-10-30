/**
 * @fileoverview Unit tests for WidgetGalleryComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { WidgetGalleryComponent } from './widget-gallery.component';
import { TemplatesService, TemplateResponse } from '../../api-client';
import { createMockInputEvent } from '../../../test-utils/mock-factories';
import { vi } from 'vitest';

describe('WidgetGalleryComponent', () => {
  let fixture: ComponentFixture<WidgetGalleryComponent>;
  let component: WidgetGalleryComponent;
  let mockApi: { listTemplatesApiV1TemplatesGet: ReturnType<typeof vi.fn> };

  const templates: TemplateResponse[] = [
    { id: '1', title: 'ICU Census', category: 'Ops', description: 'ICU', sql_template: 'SELECT 1' },
    {
      id: '2',
      title: 'ER Breakdown',
      category: 'Flow',
      description: 'ER',
      sql_template: 'SELECT 2',
    },
    {
      id: '3',
      title: 'No Category',
      category: '',
      description: 'General',
      sql_template: 'SELECT 3',
    },
  ];

  beforeEach(async () => {
    mockApi = {
      listTemplatesApiV1TemplatesGet: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [WidgetGalleryComponent],
      providers: [{ provide: TemplatesService, useValue: mockApi }],
    }).compileComponents();
  });

  it('loads templates on init (success)', () => {
    mockApi.listTemplatesApiV1TemplatesGet.mockReturnValue(of(templates));

    fixture = TestBed.createComponent(WidgetGalleryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.templates().length).toBe(3);
  });

  it('handles load error and clears loading', () => {
    mockApi.listTemplatesApiV1TemplatesGet.mockReturnValue(throwError(() => new Error('fail')));

    fixture = TestBed.createComponent(WidgetGalleryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.templates().length).toBe(0);
  });

  it('filters and groups templates based on search query', () => {
    mockApi.listTemplatesApiV1TemplatesGet.mockReturnValue(of(templates));

    fixture = TestBed.createComponent(WidgetGalleryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.searchQuery.set('icu');
    const filtered = component.filteredTemplates();
    expect(filtered.length).toBe(1);

    const groups = component.groupedTemplates();
    expect(groups.length).toBe(1);
    expect(groups[0]?.category).toBe('Ops');
  });

  it('groups uncategorized templates under General', () => {
    mockApi.listTemplatesApiV1TemplatesGet.mockReturnValue(of(templates));

    fixture = TestBed.createComponent(WidgetGalleryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.searchQuery.set('');
    const groups = component.groupedTemplates();
    const general = groups.find((g) => g.category === 'General');

    expect(general).toBeTruthy();
  });

  it('filters safely when description is missing', () => {
    mockApi.listTemplatesApiV1TemplatesGet.mockReturnValue(of([]));

    fixture = TestBed.createComponent(WidgetGalleryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.templates.set([
      { id: '1', title: 'Alpha', category: 'Ops', description: 'needle', sql_template: 'SELECT 1' },
      { id: '2', title: 'Beta', category: 'Ops', sql_template: 'SELECT 2' },
    ]);

    component.searchQuery.set('needle');
    const filtered = component.filteredTemplates();

    expect(filtered.map((t) => t.id)).toEqual(['1']);
  });

  it('groups multiple items in the same category', () => {
    mockApi.listTemplatesApiV1TemplatesGet.mockReturnValue(of([]));

    fixture = TestBed.createComponent(WidgetGalleryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.templates.set([
      { id: '1', title: 'Alpha', category: 'Ops', description: 'A', sql_template: 'SELECT 1' },
      { id: '2', title: 'Beta', category: 'Ops', description: 'B', sql_template: 'SELECT 2' },
    ]);

    component.searchQuery.set('');
    const groups = component.groupedTemplates();

    expect(groups.length).toBe(1);
    expect(groups[0]?.items.length).toBe(2);
    expect(component.getEventValue(createMockInputEvent('abc'))).toBe('abc');

    // Test getTemplateSkeletonVariant and getTemplateRowSpan across template types
    expect(
      component.getTemplateSkeletonVariant({
        id: 'p',
        title: 'Service Breakdown',
        category: 'Ops',
        sql_template: 'SELECT 1',
      }),
    ).toBe('pie');
    expect(
      component.getTemplateRowSpan({
        id: 'p',
        title: 'Service Breakdown',
        category: 'Ops',
        sql_template: 'SELECT 1',
      }),
    ).toBe(5);

    expect(
      component.getTemplateSkeletonVariant({
        id: 'c',
        title: 'Daily Trend',
        category: 'Ops',
        sql_template: 'SELECT 1 GROUP BY 1',
      }),
    ).toBe('chart');
    expect(
      component.getTemplateRowSpan({
        id: 'c',
        title: 'Daily Trend',
        category: 'Ops',
        sql_template: 'SELECT 1 GROUP BY 1',
      }),
    ).toBe(5);

    expect(
      component.getTemplateSkeletonVariant({
        id: 'm',
        title: 'Risk Probability',
        category: 'Risk',
        sql_template: 'SELECT 1',
      }),
    ).toBe('metric');
    expect(
      component.getTemplateRowSpan({
        id: 'm',
        title: 'Risk Probability',
        category: 'Risk',
        sql_template: 'SELECT 1',
      }),
    ).toBe(4);

    expect(
      component.getTemplateSkeletonVariant({
        id: 't',
        title: 'Raw Visits',
        category: 'Ops',
        sql_template: 'SELECT * FROM t',
      }),
    ).toBe('table');
    expect(
      component.getTemplateRowSpan({
        id: 't',
        title: 'Raw Visits',
        category: 'Ops',
        sql_template: 'SELECT * FROM t',
      }),
    ).toBe(6);
  });
});
