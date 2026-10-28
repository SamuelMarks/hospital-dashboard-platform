/**
 * @fileoverview Service for persisting, validating, and comparing global dashboard filters in `localStorage`.
 */

import { Service } from '@angular/core';
import { GlobalFilterParams } from './dashboard.models';

/** Prefix for per-dashboard filter entries in browser `localStorage`. */
const FILTER_STORAGE_PREFIX = 'pulse_dashboard_filters_';

/**
 * Service managing serialization, runtime schema validation, and shallow comparison
 * of global dashboard filter parameters (`GlobalFilterParams`).
 */
@Service()
export class DashboardFilterPersistenceService {
  /**
   * Compares two `GlobalFilterParams` maps for shallow key-value equality.
   *
   * @param current - Existing filter parameter map.
   * @param next - Candidate filter parameter map.
   * @returns `true` if both maps contain identical keys and values, else `false`.
   */
  areFiltersEqual(current: GlobalFilterParams, next: GlobalFilterParams): boolean {
    const keysA = Object.keys(current);
    const keysB = Object.keys(next);
    if (keysA.length !== keysB.length) {
      return false;
    }
    return keysB.every((key) => current[key] === next[key]);
  }

  /**
   * Persists global filter parameters for a given dashboard ID into `localStorage`.
   *
   * @param dashboardId - Target dashboard UUID.
   * @param params - Validated global filter parameters to store.
   */
  saveFilters(dashboardId: string, params: GlobalFilterParams): void {
    if (!dashboardId || typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(`${FILTER_STORAGE_PREFIX}${dashboardId}`, JSON.stringify(params));
    } catch {
      // Ignore storage quota errors in restricted browsing contexts.
    }
  }

  /**
   * Loads and validates persisted global filter parameters for `dashboardId` from `localStorage`.
   *
   * @param dashboardId - Target dashboard UUID.
   * @returns Validated `GlobalFilterParams` dictionary, or `{}` if absent or invalid.
   */
  loadFilters(dashboardId: string): GlobalFilterParams {
    if (!dashboardId || typeof localStorage === 'undefined') {
      return {};
    }
    try {
      const raw = localStorage.getItem(`${FILTER_STORAGE_PREFIX}${dashboardId}`);
      if (!raw) {
        return {};
      }
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return {};
      }
      const validated: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          value === null ||
          (Array.isArray(value) && value.every((item) => typeof item === 'string'))
        ) {
          validated[key] = value;
        }
      }
      return validated;
    } catch {
      return {};
    }
  }

  /**
   * Removes persisted global filter parameters for `dashboardId` from `localStorage`.
   *
   * @param dashboardId - Target dashboard UUID.
   */
  clearFilters(dashboardId: string): void {
    if (!dashboardId || typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.removeItem(`${FILTER_STORAGE_PREFIX}${dashboardId}`);
    } catch {
      // Ignore storage removal errors.
    }
  }
}
