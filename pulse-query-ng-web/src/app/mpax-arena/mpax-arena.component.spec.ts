import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MpaxArenaComponent } from './mpax-arena.component';
import { MpaxArenaService, MpaxArenaResponse } from '../api-client';
import { of, throwError } from 'rxjs';
import { vi, describe, beforeEach, it, expect, afterEach } from 'vitest';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Component, input } from '@angular/core';

@Component({ selector: 'viz-markdown', template: '', standalone: true })
class MockVizMarkdownComponent {
  readonly content = input<string>('');
}

@Component({ selector: 'app-sql-snippet', template: '', standalone: true })
class MockSqlSnippetComponent {
  readonly sql = input<string>('');
}

describe('MpaxArenaComponent', () => {
  let component: MpaxArenaComponent;
  let fixture: ComponentFixture<MpaxArenaComponent>;
  let mockApi: any;

  beforeEach(async () => {
    mockApi = {
      runMpaxArenaApiV1MpaxArenaRunPost: vi.fn(),
    };

    TestBed.overrideComponent(MpaxArenaComponent, {
      remove: { imports: [MockVizMarkdownComponent, MockSqlSnippetComponent] },
      add: { imports: [MockVizMarkdownComponent, MockSqlSnippetComponent] },
    });

    await TestBed.configureTestingModule({
      imports: [MpaxArenaComponent, NoopAnimationsModule],
      providers: [{ provide: MpaxArenaService, useValue: mockApi }],
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
    expect(component.mode).toBe('judge');
    expect(component.isLoading()).toBe(false);
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
    mockApi.runMpaxArenaApiV1MpaxArenaRunPost.mockReturnValue(of(mockRes));

    component.run();

    expect(component.isLoading()).toBe(false);
    expect(component.error()).toBeNull();
    expect(component.result()).toEqual(mockRes);
    expect(mockApi.runMpaxArenaApiV1MpaxArenaRunPost).toHaveBeenCalledWith({
      prompt: component.prompt,
      mode: component.mode,
    });
  });

  it('should handle error during run', () => {
    mockApi.runMpaxArenaApiV1MpaxArenaRunPost.mockReturnValue(
      throwError(() => ({ error: { detail: 'Boom' } })),
    );

    component.run();

    expect(component.isLoading()).toBe(false);
    expect(component.error()).toBe('Boom');
    expect(component.result()).toBeNull();
  });

  it('should fallback to error message', () => {
    mockApi.runMpaxArenaApiV1MpaxArenaRunPost.mockReturnValue(
      throwError(() => new Error('Net err')),
    );

    component.run();

    expect(component.isLoading()).toBe(false);
    expect(component.error()).toBe('Net err');
  });

  it('should fallback to generic error message', () => {
    mockApi.runMpaxArenaApiV1MpaxArenaRunPost.mockReturnValue(throwError(() => ({})));

    component.run();

    expect(component.isLoading()).toBe(false);
    expect(component.error()).toBe('Arena failed');
  });
});
