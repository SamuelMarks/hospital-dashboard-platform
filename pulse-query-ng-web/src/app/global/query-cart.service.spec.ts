import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { QueryCartService } from './query-cart.service';
import { QUERY_CART_ITEM_KIND, type QueryCartItem } from './query-cart.models';

const STORAGE_KEY = 'pulse-query-cart-v1';

describe('QueryCartService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('should add items with derived titles', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService);
    const item = service.add('SELECT * FROM visits') as QueryCartItem;

    expect(item).toBeTruthy();
    expect(service.items().length).toBe(1);
    expect(service.count()).toBe(1);
    expect(item.title.length).toBeGreaterThan(0);
  });

  it('should truncate long titles', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService);
    const longSql = 'SELECT * FROM table WHERE column = 1 '.repeat(5);
    const item = service.add(longSql) as QueryCartItem;

    expect(item.title.endsWith('...')).toBe(true);
  });

  it('should return a fallback title for empty input', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService) as any;
    expect(service.deriveTitle('   ')).toBe('Untitled Query');
  });

  it('should ignore empty SQL', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService);
    const item = service.add('   ');

    expect(item).toBeNull();
    expect(service.count()).toBe(0);
  });

  it('should prefer explicit titles', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService);
    const item = service.add('SELECT 1', 'Custom Title') as QueryCartItem;

    expect(item.title).toBe('Custom Title');
  });

  it('should rename and remove items', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService);
    const item = service.add('SELECT 1') as QueryCartItem;

    service.rename(item.id, 'New Name');
    expect(service.items()[0].title).toBe('New Name');

    service.remove(item.id);
    expect(service.items().length).toBe(0);
  });

  it('should ignore blank rename values', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService);
    const item = service.add('SELECT 1') as QueryCartItem;
    const originalTitle = item.title;

    service.rename(item.id, '   ');

    expect(service.items()[0].title).toBe(originalTitle);
  });

  it('should clear items', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService);
    service.add('SELECT 1');
    service.clear();

    expect(service.count()).toBe(0);
  });

  it('should load items from storage in browser mode', () => {
    const stored: QueryCartItem[] = [
      {
        id: 'q1',
        title: 'Saved',
        sql: 'SELECT 1',
        createdAt: '2024-01-01T00:00:00Z',
        kind: QUERY_CART_ITEM_KIND,
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService);
    expect(service.items().length).toBe(1);
    expect(service.items()[0].id).toBe('q1');
  });

  it('should filter invalid items from storage', () => {
    const stored: Array<Partial<QueryCartItem>> = [
      { id: 'bad', title: 'Missing Kind', sql: 'SELECT 1', createdAt: '2024-01-01T00:00:00Z' },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService);
    expect(service.items().length).toBe(0);
  });

  it('should ignore invalid storage payloads', () => {
    localStorage.setItem(STORAGE_KEY, '{bad json');

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService);
    expect(service.items().length).toBe(0);
  });

  it('should ignore non-array storage payloads', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }));

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService);
    expect(service.items().length).toBe(0);
  });

  it('should validate items with required fields', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService) as any;
    expect(service.isValidItem(null)).toBe(false);
    expect(
      service.isValidItem({
        id: 1,
        title: 't',
        sql: 's',
        createdAt: 'c',
        kind: QUERY_CART_ITEM_KIND,
      }),
    ).toBe(false);
    expect(
      service.isValidItem({
        id: '1',
        title: 2,
        sql: 's',
        createdAt: 'c',
        kind: QUERY_CART_ITEM_KIND,
      }),
    ).toBe(false);
    expect(
      service.isValidItem({
        id: '1',
        title: 't',
        sql: 3,
        createdAt: 'c',
        kind: QUERY_CART_ITEM_KIND,
      }),
    ).toBe(false);
    expect(
      service.isValidItem({
        id: '1',
        title: 't',
        sql: 's',
        createdAt: 4,
        kind: QUERY_CART_ITEM_KIND,
      }),
    ).toBe(false);
    expect(
      service.isValidItem({ id: '1', title: 't', sql: 's', createdAt: 'c', kind: 'other' }),
    ).toBe(false);
    expect(
      service.isValidItem({
        id: '1',
        title: 't',
        sql: 's',
        createdAt: 'c',
        kind: QUERY_CART_ITEM_KIND,
      }),
    ).toBe(true);
  });

  it('should swallow storage errors when persisting', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService);
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = vi.fn(() => {
      throw new Error('fail');
    });

    service.add('SELECT 4');
    TestBed.flushEffects();

    localStorage.setItem = originalSetItem;
    expect(service.count()).toBe(1);
  });

  it('should persist items to storage', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService) as any;
    service.persistToStorage([
      {
        id: 'q5',
        title: 'Saved',
        sql: 'SELECT 5',
        createdAt: 'c',
        kind: QUERY_CART_ITEM_KIND,
      },
    ]);

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).toContain('SELECT 5');
  });

  it('should treat undefined SQL as empty', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService);
    const item = service.add(undefined as unknown as string);

    expect(item).toBeNull();
  });

  it('should not rename when id is missing', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });

    const service = TestBed.inject(QueryCartService);
    const first = service.add('SELECT 1') as QueryCartItem;
    const second = service.add('SELECT 2') as QueryCartItem;

    service.rename('missing-id', 'New Title');

    const titles = service.items().map((item) => item.title);
    expect(titles).toEqual([second.title, first.title]);
  });

  it('should skip storage when not in browser', () => {
    const stored: QueryCartItem[] = [
      {
        id: 'q2',
        title: 'Saved',
        sql: 'SELECT 2',
        createdAt: '2024-01-01T00:00:00Z',
        kind: QUERY_CART_ITEM_KIND,
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });

    const service = TestBed.inject(QueryCartService);
    expect(service.items().length).toBe(0);

    service.add('SELECT 3');
    expect(service.count()).toBe(1);
  });
});
