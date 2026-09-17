import { TestBed } from '@angular/core/testing';
import { DATE_NOW } from './time.token';
import { describe, expect, it } from 'vitest';

describe('DATE_NOW token', () => {
  it('should provide factory returning current date', () => {
    const getDate = TestBed.inject(DATE_NOW);
    expect(getDate).toBeInstanceOf(Function);
    const d = getDate();
    expect(d).toBeInstanceOf(Date);
  });
});
