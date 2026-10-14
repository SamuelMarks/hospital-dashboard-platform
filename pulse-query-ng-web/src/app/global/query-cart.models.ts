/**
 * Discriminator constant for query-cart drag-and-drop items.
 *
 * @fileoverview Shared data models and type discriminators for the Query Cart feature.
 */
export const QUERY_CART_ITEM_KIND = 'query-cart-item' as const;

/** Type for the query-cart discriminator. */
export type QueryCartItemKind = typeof QUERY_CART_ITEM_KIND;

/**
 * Represents a saved ad-hoc SQL query staged for dashboard placement.
 */
export interface QueryCartItem {
  /** Unique identifier for cart operations. */
  id: string;
  /** Human-friendly label shown in the cart UI. */
  title: string;
  /** Raw SQL text (may include parameter tokens like {{dept}}). */
  sql: string;
  /** ISO timestamp of when the query was saved. */
  createdAt: string;
  /** Discriminator for drag-and-drop type guards. */
  kind: QueryCartItemKind;
}
