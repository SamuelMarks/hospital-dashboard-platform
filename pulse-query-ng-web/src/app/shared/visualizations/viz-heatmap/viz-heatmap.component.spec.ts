/**
 * @fileoverview Unit tests for VizHeatmapComponent.
 * Verifies heatmap grid generation, tooltip responsiveness, and data mapping logic.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VizHeatmapComponent } from './viz-heatmap.component';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

describe('VizHeatmapComponent', () => {
  let component: VizHeatmapComponent;
  let fixture: ComponentFixture<VizHeatmapComponent>;

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VizHeatmapComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VizHeatmapComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('dataSet', { columns: [], data: [] });
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render grid based on data', () => {
    const data = {
      columns: ['svc', 'hr', 'val'],
      data: [
        { svc: 'A', hr: 1, val: 10 },
        { svc: 'A', hr: 2, val: 20 },
        { svc: 'B', hr: 1, val: 5 },
        { svc: 'B', hr: 2, val: 15 },
      ],
    };
    fixture.componentRef.setInput('dataSet', data);
    fixture.detectChanges();

    const container = fixture.debugElement.query(By.css('.heatmap-container'));
    expect(container).toBeTruthy();
    expect(container.attributes['role']).toBe('grid');

    const cells = fixture.debugElement.queryAll(By.css('.cell'));
    expect(cells.length).toBe(4);
    expect(cells[0]?.attributes['aria-label']).toContain('10');
  });

  it('should render empty state when no data', () => {
    fixture.componentRef.setInput('dataSet', { columns: [], data: [] });
    fixture.detectChanges();
    const empty = fixture.debugElement.query(By.css('.flex.items-center'));
    expect(empty).toBeTruthy();
  });

  it('should compute min/max and tooltips with negative values', () => {
    const data = {
      columns: ['svc', 'hr', 'val'],
      data: [
        { svc: 'A', hr: 1, val: -5 },
        { svc: 'A', hr: 2, val: 0 },
      ],
    };
    fixture.componentRef.setInput('dataSet', data);
    fixture.detectChanges();

    const m = component.matrix();
    expect(m?.min).toBe(-5);
    expect(m?.max).toBe(0);
    if (m) {
      expect(component.getCellTooltip(m, '1', 'A')).toContain('-5');
    }
  });

  it('should use fallback range (color-mix) when all values equal', () => {
    const data = {
      columns: ['svc', 'hr', 'val'],
      data: [{ svc: 'A', hr: 1, val: 0 }],
    };
    fixture.componentRef.setInput('dataSet', data);
    fixture.detectChanges();

    const m = component.matrix();
    if (m) {
      const color = component.getCellColor(m, '1', 'A');
      expect(color).toContain('color-mix(in srgb');
      expect(color).toContain('var(--sys-error)');
    }
  });

  it('should select net_bottleneck or last column when more than 3 columns exist', () => {
    const bottleneckData = {
      columns: ['Clinical_Service', 'hour_of_day', 'admits', 'discharges', 'net_bottleneck'],
      data: [
        {
          Clinical_Service: 'Cardiology',
          hour_of_day: 6,
          admits: 100,
          discharges: 20,
          net_bottleneck: 80,
        },
      ],
    };
    fixture.componentRef.setInput('dataSet', bottleneckData);
    fixture.detectChanges();
    expect(component.matrix()?.max).toBe(80);

    const multiColData = {
      columns: ['svc', 'hr', 'admits', 'discharges', 'delta_score'],
      data: [{ svc: 'Cardiology', hr: 6, admits: 100, discharges: 20, delta_score: 42 }],
    };
    fixture.componentRef.setInput('dataSet', multiColData);
    fixture.detectChanges();
    expect(component.matrix()?.max).toBe(42);
  });
});
