/**
 * @fileoverview Unit tests for MpaxArenaComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MpaxArenaComponent } from './mpax-arena.component';
import { MpaxArenaService, MpaxArenaResponse } from '../api-client';
import { of, throwError } from 'rxjs';
import { vi, describe, beforeEach, it, expect, afterEach } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Component, input } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { resolveComponentResourcesForTests } from '../../test-utils/component-resources';

@Component({
  selector: 'viz-markdown',
  template: '',
})
class MockVizMarkdownComponent {
  readonly content = input<string>('');
}

@Component({
  selector: 'app-sql-snippet',
  template: '',
})
class MockSqlSnippetComponent {
  readonly sql = input<string>('');
}

describe('MpaxArenaComponent', () => {
  let component: MpaxArenaComponent;
  let fixture: ComponentFixture<MpaxArenaComponent>;
  let mockApi: {
    runMpaxArenaModeApiV1MpaxArenaRunPost: ReturnType<typeof vi.fn>;
    voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost: ReturnType<
      typeof vi.fn
    >;
  };
  let mockRoute: {
    snapshot: {
      queryParamMap: ReturnType<typeof convertToParamMap>;
    };
  };

  beforeEach(async () => {
    await resolveComponentResourcesForTests();

    mockApi = {
      runMpaxArenaModeApiV1MpaxArenaRunPost: vi.fn(),
      voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost: vi.fn(),
    };

    mockRoute = {
      snapshot: {
        queryParamMap: convertToParamMap({}),
      },
    };

    TestBed.overrideComponent(MpaxArenaComponent, {
      set: { template: '<div></div>', templateUrl: undefined },
    });

    await TestBed.configureTestingModule({
      imports: [MpaxArenaComponent, NoopAnimationsModule],
      providers: [
        { provide: MpaxArenaService, useValue: mockApi },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MpaxArenaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create and have default values', () => {
    expect(component).toBeTruthy();
    expect(component.mode()).toBe('judge');
    expect(component.isLoading()).toBe(false);
  });

  it('should initialize prompt only from route query parameters if mode is absent', () => {
    mockRoute.snapshot.queryParamMap = convertToParamMap({
      prompt: 'Only prompt set',
    });

    const customFixture = TestBed.createComponent(MpaxArenaComponent);
    const customComponent = customFixture.componentInstance;
    customFixture.detectChanges();

    expect(customComponent.prompt()).toBe('Only prompt set');
    expect(customComponent.mode()).toBe('judge');
  });

  it('should initialize mode only from route query parameters if prompt is absent', () => {
    mockRoute.snapshot.queryParamMap = convertToParamMap({
      mode: 'translator',
    });

    const customFixture = TestBed.createComponent(MpaxArenaComponent);
    const customComponent = customFixture.componentInstance;
    customFixture.detectChanges();

    expect(customComponent.mode()).toBe('translator');
  });

  it('should initialize prompt and mode from route query parameters if present', () => {
    mockRoute.snapshot.queryParamMap = convertToParamMap({
      prompt: 'Custom clinical scenario from benchmark',
      mode: 'critic',
    });

    const customFixture = TestBed.createComponent(MpaxArenaComponent);
    const customComponent = customFixture.componentInstance;
    customFixture.detectChanges();

    expect(customComponent.prompt()).toBe('Custom clinical scenario from benchmark');
    expect(customComponent.mode()).toBe('critic');
  });

  it('should run arena and update result on success', () => {
    const mockRes: MpaxArenaResponse = {
      experiment_id: 'exp1',
      mode: 'judge',
      ground_truth_mpax: { status: 'ok' },
      candidates: [
        {
          id: 'c1',
          model_name: 'gpt',
          content: 'test',
          mpax_score: 90,
          sql_snippet: 'select 1',
          mpax_result: {},
        },
      ],
    };
    mockApi.runMpaxArenaModeApiV1MpaxArenaRunPost.mockReturnValue(of(mockRes));

    component.run();

    expect(component.isLoading()).toBe(false);
    expect(component.error()).toBeNull();
    expect(component.result()).toEqual(mockRes);
    expect(mockApi.runMpaxArenaModeApiV1MpaxArenaRunPost).toHaveBeenCalledWith({
      prompt: component.prompt(),
      mode: component.mode(),
    });
  });

  it('should handle error during run', () => {
    mockApi.runMpaxArenaModeApiV1MpaxArenaRunPost.mockReturnValue(
      throwError(() => ({ error: { detail: 'Boom' } })),
    );

    component.run();

    expect(component.isLoading()).toBe(false);
    expect(component.error()).toBe('Boom');
    expect(component.result()).toBeNull();
  });

  it('should fallback to error message', () => {
    mockApi.runMpaxArenaModeApiV1MpaxArenaRunPost.mockReturnValue(
      throwError(() => new Error('Net err')),
    );

    component.run();

    expect(component.isLoading()).toBe(false);
    expect(component.error()).toBe('Net err');
  });

  it('should fallback to generic error message', () => {
    mockApi.runMpaxArenaModeApiV1MpaxArenaRunPost.mockReturnValue(throwError(() => ({})));

    component.run();

    expect(component.isLoading()).toBe(false);
    expect(component.error()).toBe('Arena failed');
  });

  it('should vote for candidate successfully and update result', () => {
    const initialRes: MpaxArenaResponse = {
      experiment_id: 'exp1',
      mode: 'judge',
      candidates: [{ id: 'c1', model_name: 'gpt', content: 'test', is_selected: false }],
    };
    const updatedRes: MpaxArenaResponse = {
      experiment_id: 'exp1',
      mode: 'judge',
      candidates: [{ id: 'c1', model_name: 'gpt', content: 'test', is_selected: true }],
    };
    component.result.set(initialRes);
    mockApi.voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost.mockReturnValue(
      of(updatedRes),
    );

    component.vote('c1');

    expect(component.votingCandidateId()).toBeNull();
    expect(component.result()).toEqual(updatedRes);
    expect(
      mockApi.voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost,
    ).toHaveBeenCalledWith('exp1', 'c1');
  });

  it('should do nothing when vote is called without result', () => {
    component.result.set(null);
    component.vote('c1');
    expect(
      mockApi.voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost,
    ).not.toHaveBeenCalled();
  });

  it('should handle vote error gracefully', () => {
    const initialRes: MpaxArenaResponse = {
      experiment_id: 'exp1',
      mode: 'judge',
      candidates: [{ id: 'c1', model_name: 'gpt', content: 'test' }],
    };
    component.result.set(initialRes);
    mockApi.voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost.mockReturnValue(
      throwError(() => ({ error: { detail: 'Vote failed' } })),
    );

    component.vote('c1');

    expect(component.votingCandidateId()).toBeNull();
    expect(component.error()).toBe('Vote failed');
  });

  it('should fallback to err.message during vote error', () => {
    const initialRes: MpaxArenaResponse = {
      experiment_id: 'exp1',
      mode: 'judge',
      candidates: [{ id: 'c1', model_name: 'gpt', content: 'test' }],
    };
    component.result.set(initialRes);
    mockApi.voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost.mockReturnValue(
      throwError(() => new Error('Vote network error')),
    );

    component.vote('c1');

    expect(component.votingCandidateId()).toBeNull();
    expect(component.error()).toBe('Vote network error');
  });

  it('should fallback to generic message during vote error with non-object error', () => {
    const initialRes: MpaxArenaResponse = {
      experiment_id: 'exp1',
      mode: 'judge',
      candidates: [{ id: 'c1', model_name: 'gpt', content: 'test' }],
    };
    component.result.set(initialRes);
    mockApi.voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost.mockReturnValue(
      throwError(() => 'string-error'),
    );

    component.vote('c1');

    expect(component.votingCandidateId()).toBeNull();
    expect(component.error()).toBe('Voting failed');
  });

  it('should fallback to generic message when error message is empty', () => {
    const initialRes: MpaxArenaResponse = {
      experiment_id: 'exp1',
      mode: 'judge',
      candidates: [{ id: 'c1', model_name: 'gpt', content: 'test' }],
    };
    component.result.set(initialRes);
    mockApi.voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost.mockReturnValue(
      throwError(() => ({ message: '   ' })),
    );

    component.vote('c1');

    expect(component.votingCandidateId()).toBeNull();
    expect(component.error()).toBe('Voting failed');
  });
});
