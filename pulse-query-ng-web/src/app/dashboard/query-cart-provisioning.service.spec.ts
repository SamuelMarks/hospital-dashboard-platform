import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { QueryCartProvisioningService } from './query-cart-provisioning.service';
import { DashboardsService, WidgetResponse } from '../api-client';
import { DashboardStore } from './dashboard.store';
import { QueryCartService } from '../global/query-cart.service';
import { QUERY_CART_ITEM_KIND, type QueryCartItem } from '../global/query-cart.models';

const makeItem = (): QueryCartItem => ({
  id: 'q1',
  title: 'Test Query',
  sql: 'SELECT 1',
  createdAt: '2024-01-01T00:00:00Z',
  kind: QUERY_CART_ITEM_KIND,
});

describe('QueryCartProvisioningService', () => {
  it('should create a widget and refresh dashboard', () => {
    const mockDashApi = {
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn(),
    };
    const mockStore = { refreshWidget: vi.fn() };
    const mockCart = { remove: vi.fn() };
    const widget: WidgetResponse = { id: 'w1', dashboard_id: 'd1' } as WidgetResponse;

    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(widget));

    TestBed.configureTestingModule({
      providers: [
        QueryCartProvisioningService,
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: DashboardStore, useValue: mockStore },
        { provide: QueryCartService, useValue: mockCart },
      ],
    });

    const service = TestBed.inject(QueryCartProvisioningService);
    const item = makeItem();

    service.addToDashboard(item, 'd1').subscribe((result) => {
      expect(result).toBe(widget);
    });

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({
        title: 'Test Query',
        type: 'SQL',
        visualization: 'table',
        config: expect.objectContaining({ query: 'SELECT 1', w: 6, h: 4 }),
      }),
    );
    expect(mockStore.refreshWidget).toHaveBeenCalledWith('w1');
    expect(mockCart.remove).toHaveBeenCalledWith('q1');
  });
});
