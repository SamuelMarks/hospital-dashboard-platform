/**
 * @fileoverview Service for persisting and restoring offline dashboard snapshots in `localStorage`.
 */

import { Service } from '@angular/core';
import { DashboardResponse } from '../api-client';
import { safeStorage } from '../core/storage.utils';
import { WidgetExecutionPayload } from './dashboard.models';

/**
 * Serialized snapshot of a dashboard and its last known widget execution results.
 */
export interface DashboardOfflineSnapshot {
  /** Cached dashboard response metadata and widget definitions. */
  dashboard: DashboardResponse;
  /** Cached widget execution results keyed by widget UUID. */
  dataMap: Record<string, WidgetExecutionPayload>;
  /** ISO-8601 timestamp when the snapshot was persisted. */
  savedAt: string;
}

/** LocalStorage key prefix used for persisted dashboard offline snapshots. */
const CACHE_KEY_PREFIX = 'pulse_dashboard_snapshot_';

/**
 * Service encapsulating local storage serialization and retrieval for offline dashboard mode.
 */
@Service()
export class DashboardOfflineCacheService {
  /**
   * Saves a dashboard and its execution data map to `localStorage`.
   *
   * @param dashboard - Dashboard metadata and widget list to cache.
   * @param dataMap - Map of widget IDs to execution payloads.
   * @param now - Optional timestamp for deterministic testing.
   */
  saveSnapshot(
    dashboard: DashboardResponse,
    dataMap: Record<string, WidgetExecutionPayload>,
    now: Date = new Date(),
  ): void {
    const snapshot: DashboardOfflineSnapshot = {
      dashboard,
      dataMap,
      savedAt: now.toISOString(),
    };
    safeStorage.setItem(`${CACHE_KEY_PREFIX}${dashboard.id}`, JSON.stringify(snapshot));
  }

  /**
   * Loads a previously cached dashboard snapshot by `dashboardId`.
   *
   * @param dashboardId - Target dashboard UUID.
   * @returns Parsed `DashboardOfflineSnapshot`, or `null` if unavailable or malformed.
   */
  loadSnapshot(dashboardId: string): DashboardOfflineSnapshot | null {
    const raw = safeStorage.getItem(`${CACHE_KEY_PREFIX}${dashboardId}`);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<DashboardOfflineSnapshot>;
      if (parsed && typeof parsed === 'object' && parsed.dashboard && parsed.dashboard.id) {
        return {
          dashboard: parsed.dashboard,
          dataMap: parsed.dataMap ?? {},
          savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Removes a cached dashboard snapshot from `localStorage`.
   *
   * @param dashboardId - Target dashboard UUID to evict.
   */
  clearSnapshot(dashboardId: string): void {
    safeStorage.removeItem(`${CACHE_KEY_PREFIX}${dashboardId}`);
  }
}
