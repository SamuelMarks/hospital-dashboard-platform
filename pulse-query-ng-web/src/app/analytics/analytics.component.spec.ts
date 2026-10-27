/**
 * @fileoverview Unit tests for `AnalyticsComponent`.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { AnalyticsComponent } from './analytics.component';
import { AnalyticsService, LlmAnalyticsRow } from './analytics.service';
import { readTemplate } from '../../test-utils/component-resources';

describe('AnalyticsComponent', () => {
  let fixture: ComponentFixture<AnalyticsComponent>;
  let component: AnalyticsComponent;
  let mockApi: { listLlmOutputs: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockApi = {
      listLlmOutputs: vi.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [AnalyticsComponent],
      providers: [provideRouter([])],
    })
      .overrideComponent(AnalyticsComponent, {
        set: { providers: [{ provide: AnalyticsService, useValue: mockApi }] },
      })
      .overrideComponent(AnalyticsComponent, {
        set: { template: readTemplate('./analytics.component.html'), templateUrl: undefined },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AnalyticsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with default filter state', () => {
    expect(component).toBeTruthy();
    expect(component.rows()).toEqual([]);
    expect(component.modelFilter()).toBe('all');
    expect(component.userFilter()).toBe('all');
    expect(component.sourceFilter()).toBe('all');
  });

  it('should load analytics on init', () => {
    expect(mockApi.listLlmOutputs).toHaveBeenCalled();
  });

  it('filters rows, searches, and clears filters', () => {
    const row1: LlmAnalyticsRow = {
      source: 'chat',
      candidate_id: 'c1',
      assistant_message_id: 'm1',
      conversation_id: 'conv1',
      conversation_title: 'Sales',
      user_id: 'u1',
      user_email: 'a@example.com',
      query_text: 'Revenue query',
      prompt_strategy: null,
      llm: 'GPT-4o',
      sql_snippet: 'SELECT 1',
      sql_hash: 'hash1',
      is_selected: true,
      created_at: '2024-01-01T00:00:00Z',
    };
    const row2: LlmAnalyticsRow = {
      source: 'ai',
      candidate_id: 'c2',
      assistant_message_id: 'm2',
      conversation_id: null,
      conversation_title: null,
      user_id: 'u2',
      user_email: 'b@example.com',
      query_text: 'Inventory',
      prompt_strategy: 'schema-aware',
      llm: 'Mistral',
      sql_snippet: null,
      sql_hash: null,
      is_selected: false,
      created_at: '2024-01-02T00:00:00Z',
    };
    const rows: LlmAnalyticsRow[] = [row1, row2];

    component.rows.set(rows);
    TestBed.flushEffects();

    expect(component.models()).toEqual(['GPT-4o', 'Mistral']);
    expect(component.users()).toEqual(['a@example.com', 'b@example.com']);
    expect(component.sourceLabel(row1)).toBe('Chat Arena');
    expect(component.sourceLabel(row2)).toBe('AI Arena');
    component.selectRow(row2);
    expect(component.selectedRow()).toEqual(row2);

    component.modelFilter.set('GPT-4o');
    expect(component.filteredRows().length).toBe(1);

    component.modelFilter.set('all');
    component.userFilter.set('b@example.com');
    expect(component.filteredRows()[0]?.candidate_id).toBe('c2');

    component.userFilter.set('all');
    component.sourceFilter.set('ai');
    expect(component.filteredRows()[0]?.candidate_id).toBe('c2');

    component.sourceFilter.set('all');
    component.scoreFilter.set('selected');
    expect(component.filteredRows()[0]?.candidate_id).toBe('c1');
    component.scoreFilter.set('unselected');
    expect(component.filteredRows()[0]?.candidate_id).toBe('c2');

    component.scoreFilter.set('all');
    component.sqlFilter.set('with_sql');
    expect(component.filteredRows()[0]?.candidate_id).toBe('c1');
    component.sqlFilter.set('no_sql');
    expect(component.filteredRows()[0]?.candidate_id).toBe('c2');

    component.sqlFilter.set('all');
    component.searchText.set('schema-aware');
    expect(component.filteredRows()[0]?.candidate_id).toBe('c2');
    component.searchText.set('Revenue');
    expect(component.filteredRows()[0]?.candidate_id).toBe('c1');

    const missingRow: LlmAnalyticsRow = {
      source: 'chat',
      candidate_id: 'c3',
      assistant_message_id: null,
      conversation_id: null,
      conversation_title: null,
      user_id: 'u3',
      user_email: '',
      query_text: null,
      prompt_strategy: null,
      llm: '',
      sql_snippet: '',
      sql_hash: null,
      is_selected: false,
      created_at: '2024-01-03T00:00:00Z',
    };
    Object.assign(missingRow, { source: '' });
    component.rows.set([...rows, missingRow]);
    component.searchText.set('missing');
    component.filteredRows();

    component.clearFilters();
    expect(component.searchText()).toBe('');
    expect(component.modelFilter()).toBe('all');
    expect(component.userFilter()).toBe('all');
    expect(component.scoreFilter()).toBe('all');
    expect(component.sqlFilter()).toBe('all');
    expect(component.sourceFilter()).toBe('all');
    expect(component.scoreLabel(row1)).toBe('Selected');
    expect(component.scoreLabel(row2)).toBe('Not selected');
  });

  it('computes summary metrics and maintains selection', () => {
    const row1: LlmAnalyticsRow = {
      source: 'chat',
      candidate_id: 'c1',
      assistant_message_id: 'm1',
      conversation_id: 'conv1',
      conversation_title: 'Sales',
      user_id: 'u1',
      user_email: 'a@example.com',
      query_text: 'Revenue query',
      prompt_strategy: null,
      llm: 'GPT-4o',
      sql_snippet: 'SELECT 1',
      sql_hash: 'hash1',
      is_selected: true,
      created_at: '2024-01-01T00:00:00Z',
    };
    const row2: LlmAnalyticsRow = {
      source: 'chat',
      candidate_id: 'c2',
      assistant_message_id: 'm1',
      conversation_id: 'conv1',
      conversation_title: 'Sales',
      user_id: 'u1',
      user_email: 'a@example.com',
      query_text: 'Revenue query',
      prompt_strategy: null,
      llm: 'Mistral',
      sql_snippet: null,
      sql_hash: null,
      is_selected: false,
      created_at: '2024-01-01T00:00:00Z',
    };
    const rows: LlmAnalyticsRow[] = [row1, row2];

    component.rows.set(rows);
    TestBed.flushEffects();

    const summary = component.summary();
    expect(summary.totalCandidates).toBe(2);
    expect(summary.totalQueries).toBe(1);
    expect(summary.totalUsers).toBe(1);
    expect(summary.totalModels).toBe(2);
    expect(summary.selected).toBe(1);
    expect(summary.selectionRate).toBe(50);
    expect(summary.sqlCoverage).toBe(50);

    component.selectedRow.set(row2);
    component.modelFilter.set('Mistral');
    TestBed.flushEffects();
    expect(component.selectedRow()?.candidate_id).toBe('c2');

    component.modelFilter.set('GPT-4o');
    TestBed.flushEffects();
    expect(component.selectedRow()?.candidate_id).toBe('c1');

    component.searchText.set('no-match');
    TestBed.flushEffects();
    expect(component.selectedRow()).toBeNull();

    const emptySummary = component.summary();
    expect(emptySummary.totalCandidates).toBe(0);
    expect(emptySummary.selectionRate).toBe(0);
    expect(emptySummary.sqlCoverage).toBe(0);
  });

  it('loads data and handles errors', () => {
    const rows: LlmAnalyticsRow[] = [
      {
        source: 'chat',
        candidate_id: 'c1',
        assistant_message_id: 'm1',
        conversation_id: 'conv1',
        conversation_title: 'Sales',
        user_id: 'u1',
        user_email: 'a@example.com',
        query_text: 'Revenue query',
        prompt_strategy: null,
        llm: 'GPT-4o',
        sql_snippet: 'SELECT 1',
        sql_hash: 'hash1',
        is_selected: true,
        created_at: '2024-01-01T00:00:00Z',
      },
    ];

    mockApi.listLlmOutputs.mockReturnValueOnce(of(rows));
    component.load();
    expect(component.rows().length).toBe(1);
    expect(component.selectedRow()?.candidate_id).toBe('c1');
    expect(component.isLoading()).toBe(false);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockApi.listLlmOutputs.mockReturnValueOnce(throwError(() => new Error('boom')));
    component.load();
    expect(component.error()).toBe('Failed to load analytics. Please try again.');
    expect(component.isLoading()).toBe(false);
    errorSpy.mockRestore();
  });
});
