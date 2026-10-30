/**
 * @fileoverview Shimmer skeleton placeholder component for asynchronous widget loading states.
 */

import { Component, input } from '@angular/core';

/** Supported visual layout variants for the skeleton placeholder. */
export type SkeletonVariant =
  'card' | 'table' | 'chart' | 'metric' | 'pie' | 'heatmap' | 'list' | 'dashboard-grid';

/**
 * Renders animated shimmer placeholder layouts tailored to specific widget visualization types.
 */
@Component({
  selector: 'app-skeleton-loader',
  imports: [],
  host: {
    role: 'status',
    'aria-busy': 'true',
    'aria-live': 'polite',
    '[attr.aria-label]': 'ariaLabel',
  },
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      .skeleton-box {
        background-color: var(--sys-surface-border, #e2e8f0);
        position: relative;
        overflow: hidden;
        border-radius: 4px;
      }
      .skeleton-box::after {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        transform: translateX(-100%);
        background-image: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0) 0,
          rgba(255, 255, 255, 0.35) 20%,
          rgba(255, 255, 255, 0.65) 60%,
          rgba(255, 255, 255, 0)
        );
        animation: shimmer 1.5s infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        .skeleton-box::after {
          animation: none;
        }
      }
      @keyframes shimmer {
        100% {
          transform: translateX(100%);
        }
      }
      .layout-card {
        height: 100%;
        display: flex;
        flex-direction: column;
        padding: 16px;
        gap: 12px;
        border: 1px solid var(--sys-surface-border);
        border-radius: 8px;
        background: var(--sys-surface);
        box-sizing: border-box;
      }
      .layout-metric {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 16px;
        box-sizing: border-box;
      }
      .metric-val {
        height: 48px;
        width: 55%;
      }
      .metric-lbl {
        height: 16px;
        width: 40%;
      }
      .metric-sparkline {
        height: 20px;
        width: 75%;
        margin-top: 4px;
      }
      .layout-chart {
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px;
        box-sizing: border-box;
      }
      .chart-bars {
        flex: 1;
        display: flex;
        align-items: flex-end;
        justify-content: space-around;
        gap: 10px;
        padding-top: 12px;
      }
      .chart-bar {
        flex: 1;
        border-radius: 4px 4px 0 0;
      }
      .chart-axis {
        height: 2px;
        width: 100%;
      }
      .layout-table {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
        height: 100%;
        box-sizing: border-box;
      }
      .table-head {
        height: 32px;
        width: 100%;
      }
      .table-row {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr;
        gap: 10px;
      }
      .table-cell {
        height: 24px;
        width: 100%;
      }
      .layout-pie {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 20px;
        padding: 12px;
        box-sizing: border-box;
      }
      .pie-circle {
        width: 120px;
        height: 120px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .pie-legend {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 90px;
      }
      .layout-heatmap {
        height: 100%;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        grid-template-rows: repeat(3, 1fr);
        gap: 8px;
        padding: 12px;
        box-sizing: border-box;
      }
      .layout-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 8px;
      }
      .list-item {
        height: 56px;
        width: 100%;
        border-radius: 8px;
      }
      .layout-dashboard-grid {
        display: grid;
        grid-template-columns: repeat(12, 1fr);
        gap: 20px;
        width: 100%;
      }
      .dash-col-4 {
        grid-column: span 4;
        height: 180px;
      }
      .dash-col-6 {
        grid-column: span 6;
        height: 300px;
      }
    `,
  ],
  template: `
    @switch (variant()) {
      @case ('metric') {
        <div class="layout-metric">
          <div class="skeleton-box metric-val"></div>
          <div class="skeleton-box metric-lbl"></div>
          <div class="skeleton-box metric-sparkline"></div>
        </div>
      }
      @case ('chart') {
        <div class="layout-chart">
          <div class="chart-bars">
            <div class="skeleton-box chart-bar" style="height: 45%"></div>
            <div class="skeleton-box chart-bar" style="height: 80%"></div>
            <div class="skeleton-box chart-bar" style="height: 60%"></div>
            <div class="skeleton-box chart-bar" style="height: 95%"></div>
            <div class="skeleton-box chart-bar" style="height: 70%"></div>
          </div>
          <div class="skeleton-box chart-axis"></div>
        </div>
      }
      @case ('table') {
        <div class="layout-table">
          <div class="skeleton-box table-head"></div>
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="table-row" [style.opacity]="1 - i * 0.15">
              <div class="skeleton-box table-cell"></div>
              <div class="skeleton-box table-cell"></div>
              <div class="skeleton-box table-cell"></div>
            </div>
          }
        </div>
      }
      @case ('pie') {
        <div class="layout-pie">
          <div class="skeleton-box pie-circle"></div>
          <div class="pie-legend">
            <div class="skeleton-box" style="height: 14px; width: 100%"></div>
            <div class="skeleton-box" style="height: 14px; width: 80%"></div>
            <div class="skeleton-box" style="height: 14px; width: 65%"></div>
          </div>
        </div>
      }
      @case ('heatmap') {
        <div class="layout-heatmap">
          @for (cell of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; track cell) {
            <div class="skeleton-box" style="height: 100%; width: 100%"></div>
          }
        </div>
      }
      @case ('list') {
        <div class="layout-list">
          @for (row of [1, 2, 3, 4]; track row) {
            <div class="skeleton-box list-item"></div>
          }
        </div>
      }
      @case ('dashboard-grid') {
        <div class="layout-dashboard-grid">
          <div class="layout-card dash-col-4">
            <div class="skeleton-box" style="height: 18px; width: 55%"></div>
            <div class="skeleton-box" style="flex: 1; width: 100%"></div>
          </div>
          <div class="layout-card dash-col-4">
            <div class="skeleton-box" style="height: 18px; width: 55%"></div>
            <div class="skeleton-box" style="flex: 1; width: 100%"></div>
          </div>
          <div class="layout-card dash-col-4">
            <div class="skeleton-box" style="height: 18px; width: 55%"></div>
            <div class="skeleton-box" style="flex: 1; width: 100%"></div>
          </div>
          <div class="layout-card dash-col-6">
            <div class="skeleton-box" style="height: 20px; width: 45%"></div>
            <div class="skeleton-box" style="height: 14px; width: 70%"></div>
            <div class="skeleton-box" style="flex: 1; width: 100%"></div>
          </div>
          <div class="layout-card dash-col-6">
            <div class="skeleton-box" style="height: 20px; width: 45%"></div>
            <div class="skeleton-box" style="height: 14px; width: 70%"></div>
            <div class="skeleton-box" style="flex: 1; width: 100%"></div>
          </div>
        </div>
      }
      @default {
        <div class="layout-card">
          <div class="skeleton-box" style="height: 20px; width: 50%"></div>
          <div class="skeleton-box" style="height: 14px; width: 75%"></div>
          <div class="skeleton-box" style="flex: 1; width: 100%"></div>
        </div>
      }
    }
  `,
})
export class SkeletonLoaderComponent {
  /** Layout shape variant to display while widget data is loading. */
  readonly variant = input<SkeletonVariant>('card');
  /** Localized accessible label for the loading status region. */
  readonly ariaLabel = $localize`Loading content`;
}
