import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { DashboardsService, WidgetCreateSql, WidgetResponse } from '../api-client';
import { DashboardStore } from './dashboard.store';
import { QueryCartItem } from '../global/query-cart.models';
import { QueryCartService } from '../global/query-cart.service';

/**
 * Creates dashboard widgets from Query Cart items.
 */
@Injectable({
  providedIn: 'root',
})
export class QueryCartProvisioningService {
  /** dashboardsApi property. */
  private readonly dashboardsApi = inject(DashboardsService);
  /** store property. */
  private readonly store = inject(DashboardStore);
  /** cart property. */
  private readonly cart = inject(QueryCartService);

  /**
   * Adds a cart item to a dashboard as a SQL widget.
   *
   * @param item - Cart item to provision.
   * @param dashboardId - Target dashboard id.
   * @returns Observable of the created widget.
   */
  addToDashboard(item: QueryCartItem, dashboardId: string): Observable<WidgetResponse> {
    const payload: WidgetCreateSql = {
      title: item.title,
      type: 'SQL',
      visualization: 'table',
      config: {
        query: item.sql,
        x: 0,
        y: 0,
        w: 6,
        h: 4,
      },
    };

    return this.dashboardsApi
      .createWidgetApiV1DashboardsDashboardIdWidgetsPost(dashboardId, payload)
      .pipe(
        map((widget) => {
          this.store.refreshWidget(widget.id);
          this.cart.remove(item.id);
          return widget;
        }),
      );
  }
}
