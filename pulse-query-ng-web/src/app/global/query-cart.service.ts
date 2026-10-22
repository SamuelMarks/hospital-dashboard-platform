/**
 * @fileoverview Service managing the reactive state and localStorage persistence of the Query Cart.
 */
import { DATE_NOW } from '../core/time.token';
import { safeStorage } from '../core/storage.utils';
import { Service, computed, effect, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { QUERY_CART_ITEM_KIND, type QueryCartItem } from './query-cart.models';

/**
 * Service for managing the Query Cart state and persistence.
 *
 * Stores saved ad-hoc queries that can be dragged onto dashboards.
 */
@Service()
export class QueryCartService {
  /** Date now token. */
  private readonly dateNow = inject(DATE_NOW);
  /** Angular platform identifier token used to guard browser-only storage operations. */
  private readonly platformId = inject(PLATFORM_ID);
  /** LocalStorage key under which staged query cart items are serialized. */
  private readonly storageKey = 'pulse-query-cart-v1';

  /** Internal writable signal holding the ordered list of staged query cart items. */
  private readonly _items = signal<QueryCartItem[]>([]);

  /** Read-only list of cart items. */
  readonly items = this._items.asReadonly();

  /** Count of items in the cart. */
  readonly count = computed(() => this._items().length);

  /** Hydrates staged queries from browser storage and registers an effect to persist updates. */
  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadFromStorage();
      effect(() => this.persistToStorage(this._items()));
    }
  }

  /**
   * Adds a SQL query to the cart.
   *
   * @param sql - Raw SQL text.
   * @param title - Optional title override.
   * @returns The created cart item, or null when SQL is empty.
   */
  add(sql: string, title?: string): QueryCartItem | null {
    const trimmed = (sql || '').trim();
    if (!trimmed) return null;

    const item: QueryCartItem = {
      id: this.createId(),
      title: title?.trim() || this.deriveTitle(trimmed),
      sql: trimmed,
      createdAt: this.dateNow().toISOString(),
      kind: QUERY_CART_ITEM_KIND,
    };

    this._items.update((curr) => [item, ...curr]);
    return item;
  }

  /**
   * Removes an item from the cart.
   *
   * @param id - Cart item id.
   */
  remove(id: string): void {
    this._items.update((curr) => curr.filter((item) => item.id !== id));
  }

  /**
   * Renames a cart item.
   *
   * @param id - Cart item id.
   * @param title - New title.
   */
  rename(id: string, title: string): void {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    this._items.update((curr) =>
      curr.map((item) => (item.id === id ? { ...item, title: nextTitle } : item)),
    );
  }

  /**
   * Clears all items from the cart.
   */
  clear(): void {
    this._items.set([]);
  }

  /**
   * Derives a concise default title from a raw SQL query string.
   *
   * @param sql - The raw SQL query string.
   * @returns Truncated single-line title derived from the SQL text.
   */
  private deriveTitle(sql: string): string {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (!normalized) return 'Untitled Query';
    const max = 42;
    return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
  }

  /**
   * Generates a unique identifier for a new query cart item.
   *
   * @returns Generated unique query cart item identifier.
   */
  private createId(): string {
    return `qc-${this.dateNow().getTime()}-${Math.floor(Math.random() * 10000)}`;
  }

  /** Loads and validates saved query cart items from local storage. */
  private loadFromStorage(): void {
    try {
      const raw = safeStorage.getItem(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as QueryCartItem[];
      const safe = Array.isArray(parsed) ? parsed.filter(this.isValidItem) : [];
      this._items.set(safe);
    } catch {
      this._items.set([]);
    }
  }

  /**
   * Serializes and persists the current query cart items to local storage.
   *
   * @param items - Array of query cart items to persist.
   */
  private persistToStorage(items: QueryCartItem[]): void {
    try {
      safeStorage.setItem(this.storageKey, JSON.stringify(items));
    } catch {
      // Ignore storage errors (quota, disabled, etc.)
    }
  }

  /**
   * Type guard validating that a parsed storage entry conforms to `QueryCartItem`.
   *
   * @param item - Candidate item loaded from storage.
   * @returns True if the item has all required `QueryCartItem` fields.
   */
  private isValidItem(item: QueryCartItem): boolean {
    return (
      !!item &&
      typeof item.id === 'string' &&
      typeof item.title === 'string' &&
      typeof item.sql === 'string' &&
      typeof item.createdAt === 'string' &&
      item.kind === QUERY_CART_ITEM_KIND
    );
  }
}
