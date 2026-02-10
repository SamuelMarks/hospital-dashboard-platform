import { Injectable, computed, effect, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { QueryCartItem } from './query-cart.models';

/**
 * Service for managing the Query Cart state and persistence.
 *
 * Stores saved ad-hoc queries that can be dragged onto dashboards.
 */
@Injectable({
  providedIn: 'root'
})
export class QueryCartService {
    /** platformId property. */
private readonly platformId = inject(PLATFORM_ID);
    /** storageKey property. */
private readonly storageKey = 'pulse-query-cart-v1';

    /** _items property. */
private readonly _items = signal<QueryCartItem[]>([]);

  /** Read-only list of cart items. */
  readonly items = this._items.asReadonly();

  /** Count of items in the cart. */
  readonly count = computed(() => this._items().length);

  /** Creates a new QueryCartService. */
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
      createdAt: new Date().toISOString(),
      kind: 'query-cart-item'
    };

    this._items.update(curr => [item, ...curr]);
    return item;
  }

  /**
  * Removes an item from the cart.
  *
  * @param id - Cart item id.
  */
  remove(id: string): void {
    this._items.update(curr => curr.filter(item => item.id !== id));
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

    this._items.update(curr =>
      curr.map(item => item.id === id ? { ...item, title: nextTitle } : item)
    );
  }

  /**
  * Clears all items from the cart.
  */
  clear(): void {
    this._items.set([]);
  }

    /** deriveTitle method. */
private deriveTitle(sql: string): string {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (!normalized) return 'Untitled Query';
    const max = 42;
    return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
  }

    /** createId method. */
private createId(): string {
    return `qc-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }

    /** loadFromStorage method. */
private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as QueryCartItem[];
      const safe = Array.isArray(parsed) ? parsed.filter(this.isValidItem) : [];
      this._items.set(safe);
    } catch {
      this._items.set([]);
    }
  }

    /** persistToStorage method. */
private persistToStorage(items: QueryCartItem[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(items));
    } catch {
      // Ignore storage errors (quota, disabled, etc.)
    }
  }

    /** isValidItem method. */
private isValidItem(item: QueryCartItem): boolean {
    return !!item &&
      typeof item.id === 'string' &&
      typeof item.title === 'string' &&
      typeof item.sql === 'string' &&
      typeof item.createdAt === 'string' &&
      item.kind === 'query-cart-item';
  }
}
