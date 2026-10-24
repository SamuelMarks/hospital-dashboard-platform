/**
 * @fileoverview Unit tests for `AnalyticsCandidateDetailComponent`.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnalyticsCandidateDetailComponent } from './analytics-candidate-detail.component';
import { LlmAnalyticsRow } from './analytics.service';

describe('AnalyticsCandidateDetailComponent', () => {
  let component: AnalyticsCandidateDetailComponent;
  let fixture: ComponentFixture<AnalyticsCandidateDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsCandidateDetailComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsCandidateDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render empty state when selectedRow is null', () => {
    expect(component).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Select a row to inspect the full SQL and metadata.',
    );
  });

  it('should render candidate details for chat and ai rows', () => {
    const chatRow: LlmAnalyticsRow = {
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

    fixture.componentRef.setInput('selectedRow', chatRow);
    fixture.detectChanges();

    expect(component.scoreLabel(chatRow)).toBe('Selected');
    expect(component.sourceLabel(chatRow)).toBe('Chat Arena');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('SELECT 1');

    const aiRow: LlmAnalyticsRow = {
      source: 'ai',
      candidate_id: 'c2',
      assistant_message_id: 'm2',
      conversation_id: null,
      conversation_title: null,
      user_id: 'u2',
      user_email: 'b@example.com',
      query_text: null,
      prompt_strategy: 'schema-aware',
      llm: 'Mistral',
      sql_snippet: null,
      sql_hash: null,
      is_selected: false,
      created_at: '2024-01-02T00:00:00Z',
    };

    fixture.componentRef.setInput('selectedRow', aiRow);
    fixture.detectChanges();

    expect(component.scoreLabel(aiRow)).toBe('Not selected');
    expect(component.sourceLabel(aiRow)).toBe('AI Arena');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('AI Arena Experiment');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('schema-aware');

    const unknownConvRow: LlmAnalyticsRow = {
      ...aiRow,
      source: 'chat',
      conversation_title: null,
    };
    fixture.componentRef.setInput('selectedRow', unknownConvRow);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Unknown conversation');
  });
});
