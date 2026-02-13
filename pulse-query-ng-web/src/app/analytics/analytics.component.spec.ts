import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnalyticsComponent } from './analytics.component';
import { AnalyticsService, LlmAnalyticsRow } from './analytics.service';
import { of, throwError } from 'rxjs';
import { readTemplate } from '../../test-utils/component-resources';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('AnalyticsComponent', () => {
  let fixture: ComponentFixture<AnalyticsComponent>;
  let component: AnalyticsComponent;
  let mockApi: { listLlmOutputs: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockApi = {
      listLlmOutputs: vi.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [AnalyticsComponent, NoopAnimationsModule],
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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load analytics on init', () => {
    expect(mockApi.listLlmOutputs).toHaveBeenCalled();
  });

  it('filters rows, searches, and clears filters', () => {
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
      {
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
      },
    ];

    component.rows.set(rows);
    TestBed.flushEffects();

    expect(component.models()).toEqual(['GPT-4o', 'Mistral']);
    expect(component.users()).toEqual(['a@example.com', 'b@example.com']);
    expect(component.sourceLabel(rows[0])).toBe('Chat Arena');
    expect(component.sourceLabel(rows[1])).toBe('AI Arena');
    component.selectRow(rows[1]);
    expect(component.selectedRow()).toEqual(rows[1]);

    component.modelFilter.set('GPT-4o');
    expect(component.filteredRows().length).toBe(1);

    component.modelFilter.set('all');
    component.userFilter.set('b@example.com');
    expect(component.filteredRows()[0].candidate_id).toBe('c2');

    component.userFilter.set('all');
    component.sourceFilter.set('ai');
    expect(component.filteredRows()[0].candidate_id).toBe('c2');

    component.sourceFilter.set('all');
    component.scoreFilter.set('selected');
    expect(component.filteredRows()[0].candidate_id).toBe('c1');
    component.scoreFilter.set('unselected');
    expect(component.filteredRows()[0].candidate_id).toBe('c2');

    component.scoreFilter.set('all');
    component.sqlFilter.set('with_sql');
    expect(component.filteredRows()[0].candidate_id).toBe('c1');
    component.sqlFilter.set('no_sql');
    expect(component.filteredRows()[0].candidate_id).toBe('c2');

    component.sqlFilter.set('all');
    component.searchText.set('schema-aware');
    expect(component.filteredRows()[0].candidate_id).toBe('c2');
    component.searchText.set('Revenue');
    expect(component.filteredRows()[0].candidate_id).toBe('c1');

    const missingRow = {
      source: '' as any,
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
    } as LlmAnalyticsRow;
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
    expect(component.scoreLabel(rows[0])).toBe('Selected');
    expect(component.scoreLabel(rows[1])).toBe('Not selected');
  });

  it('computes summary metrics and maintains selection', () => {
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
      {
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
      },
    ];

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

    component.selectedRow.set(rows[1]);
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

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApi.listLlmOutputs.mockReturnValueOnce(throwError(() => new Error('boom')));
    component.load();
    expect(component.error()).toBe('Failed to load analytics. Please try again.');
    expect(component.isLoading()).toBe(false);
    errorSpy.mockRestore();
  });
});
