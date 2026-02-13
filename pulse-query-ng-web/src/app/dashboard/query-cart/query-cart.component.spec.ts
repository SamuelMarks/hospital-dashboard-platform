import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QueryCartComponent } from './query-cart.component';
import { QueryCartService } from '../../global/query-cart.service';
import { QueryCartProvisioningService } from '../query-cart-provisioning.service';
import { DashboardStore } from '../dashboard.store';
import { QUERY_CART_ITEM_KIND, type QueryCartItem } from '../../global/query-cart.models';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { computed, signal, WritableSignal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { SIGNAL, signalSetFn } from '@angular/core/primitives/signals';
import { MatSnackBar } from '@angular/material/snack-bar';

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

  it('should remove items when remove button is clicked', () => {
    itemsSig.set([makeItem()]);
    fixture.detectChanges();

    const removeBtn = fixture.debugElement.query(By.css('[data-testid="remove-item"]'));
    removeBtn.nativeElement.click();

    expect(mockCart.remove).toHaveBeenCalledWith('q1');
  });

  it('should clear items when clear button is clicked', () => {
    itemsSig.set([makeItem()]);
    fixture.detectChanges();

    const clearBtn = fixture.debugElement.query(By.css('[data-testid="clear-cart"]'));
    clearBtn.nativeElement.click();

    expect(mockCart.clear).toHaveBeenCalled();
  });

  it('should rename items from prompt', () => {
    itemsSig.set([makeItem()]);
    fixture.detectChanges();

    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('New Title');
    const renameBtn = fixture.debugElement.query(By.css('button[aria-label="Rename"]'));
    renameBtn.nativeElement.click();

    expect(mockCart.rename).toHaveBeenCalledWith('q1', 'New Title');
    promptSpy.mockRestore();
  });

  it('should skip rename when prompt is cancelled', () => {
    itemsSig.set([makeItem()]);
    fixture.detectChanges();

    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    const renameBtn = fixture.debugElement.query(By.css('button[aria-label="Rename"]'));
    renameBtn.nativeElement.click();

    expect(mockCart.rename).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it('should add items to dashboard when add button is clicked', () => {
    itemsSig.set([makeItem()]);
    setInputSignal(component, 'dashboardId', 'd1');
    fixture.detectChanges();

    const addBtn = fixture.debugElement.query(By.css('[data-testid="add-to-dashboard"]'));
    addBtn.nativeElement.click();

    expect(mockProvisioning.addToDashboard).toHaveBeenCalledWith(expect.any(Object), 'd1');
    expect(mockStore.loadDashboard).toHaveBeenCalledWith('d1');
    expect(mockSnackBar.open).toHaveBeenCalled();
  });

  it('should no-op add when dashboardId is missing', () => {
    const item = makeItem();
    component.addToDashboard(item);
    expect(mockProvisioning.addToDashboard).not.toHaveBeenCalled();
  });

  it('should show error when add to dashboard fails', () => {
    itemsSig.set([makeItem()]);
    setInputSignal(component, 'dashboardId', 'd1');
    mockProvisioning.addToDashboard.mockReturnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();

    const addBtn = fixture.debugElement.query(By.css('[data-testid="add-to-dashboard"]'));
    addBtn.nativeElement.click();

    expect(mockSnackBar.open).toHaveBeenCalledWith('Failed to add query to dashboard', 'Close');
  });

  it('should truncate long SQL previews', () => {
    const longSql = 'SELECT * FROM table WHERE column = 1 '.repeat(5);
    const preview = component.previewSql(longSql);
    expect(preview.length).toBeLessThan(longSql.length);
    expect(preview.endsWith('...')).toBe(true);
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
