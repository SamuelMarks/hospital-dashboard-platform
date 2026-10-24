/**
 * @fileoverview Unit tests for `AnalyticsFilterBarComponent`.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AnalyticsFilterBarComponent } from './analytics-filter-bar.component';

describe('AnalyticsFilterBarComponent', () => {
  let component: AnalyticsFilterBarComponent;
  let fixture: ComponentFixture<AnalyticsFilterBarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsFilterBarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsFilterBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and emit filter changes and clear action', () => {
    expect(component).toBeTruthy();

    fixture.componentRef.setInput('models', ['GPT-4o', 'Mistral']);
    fixture.componentRef.setInput('users', ['a@example.com']);
    fixture.componentRef.setInput('searchText', 'initial');
    fixture.detectChanges();

    const searchSpy = vi.spyOn(component.searchTextChange, 'emit');
    const clearSpy = vi.spyOn(component.clearFilters, 'emit');

    const inputEl = (fixture.nativeElement as HTMLElement).querySelector(
      'input',
    ) as HTMLInputElement;
    inputEl.value = 'updated';
    inputEl.dispatchEvent(new Event('input'));
    expect(searchSpy).toHaveBeenCalledWith('updated');

    const clearSearchBtn = (fixture.nativeElement as HTMLElement).querySelector(
      'button[aria-label="Clear search"]',
    ) as HTMLButtonElement;
    clearSearchBtn.click();
    expect(searchSpy).toHaveBeenCalledWith('');

    const clearAllBtn = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Clear')) as HTMLButtonElement;
    clearAllBtn.click();
    expect(clearSpy).toHaveBeenCalled();
  });
});
