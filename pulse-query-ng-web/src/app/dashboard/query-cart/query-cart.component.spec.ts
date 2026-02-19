import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QueryCartComponent } from './query-cart.component';
import { QueryCartService } from '../../global/query-cart.service';
import { QueryCartProvisioningService } from '../query-cart-provisioning.service';
import { DashboardStore } from '../dashboard.store';
import { QUERY_CART_ITEM_KIND, type QueryCartItem } from '../../global/query-cart.models';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { computed, signal, WritableSignal } from '@angular/core';
import { of } from 'rxjs';
import { SIGNAL, signalSetFn } from '@angular/core/primitives/signals';
import { MatSnackBar } from '@angular/material/snack-bar';
import { vi } from 'vitest';

const makeItem = (): QueryCartItem => ({
  id: 'q1',
  title: 'Saved Query',
  sql: 'SELECT 1',
  createdAt: '2024-01-01T00:00:00Z',
  kind: QUERY_CART_ITEM_KIND,
});

describe('QueryCartComponent', () => {
  let fixture: ComponentFixture<QueryCartComponent>;
  let component: QueryCartComponent;
  let itemsSig: WritableSignal<QueryCartItem[]>;
  let mockCart: any;
  let mockProvisioning: any;
  let mockStore: any;
  let mockSnackBar: any;

  beforeEach(async () => {
    itemsSig = signal<QueryCartItem[]>([]);
    mockCart = {
      items: itemsSig.asReadonly(),
      count: computed(() => itemsSig().length),
      clear: vi.fn(),
      remove: vi.fn(),
      rename: vi.fn(),
    };
    mockProvisioning = { addToDashboard: vi.fn().mockReturnValue(of({ id: 'w1' })) };
    mockStore = { loadDashboard: vi.fn() };
    mockSnackBar = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [QueryCartComponent, NoopAnimationsModule],
      providers: [
        { provide: QueryCartService, useValue: mockCart },
        { provide: QueryCartProvisioningService, useValue: mockProvisioning },
        { provide: DashboardStore, useValue: mockStore },
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    })
      .overrideProvider(MatSnackBar, { useValue: mockSnackBar })
      .compileComponents();

    fixture = TestBed.createComponent(QueryCartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render empty state when no items', () => {
    const empty = fixture.debugElement.query(By.css('[data-testid="cart-empty"]'));
    expect(empty).toBeTruthy();
  });
});

function setInputSignal(component: any, key: string, value: unknown): void {
  const current = component[key];
  const node = current?.[SIGNAL];
  if (node) {
    if (typeof node.applyValueToInputSignal === 'function') {
      node.applyValueToInputSignal(node, value);
    } else {
      signalSetFn(node, value as never);
    }
  } else {
    component[key] = value;
  }
}
