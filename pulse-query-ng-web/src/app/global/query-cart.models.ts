/**
 * Shared models for the Query Cart feature.
 */

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
  kind: 'query-cart-item';
}
