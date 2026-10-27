/**
 * @fileoverview Unit tests for QueryCartComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QueryCartComponent } from './query-cart.component';
import { QueryCartService } from '../../global/query-cart.service';
import { QueryCartProvisioningService } from '../query-cart-provisioning.service';
import { DashboardStore } from '../dashboard.store';
import { QUERY_CART_ITEM_KIND, type QueryCartItem } from '../../global/query-cart.models';
import { computed, signal, Signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { PromptDialogComponent } from '../../shared/components/dialogs/prompt-dialog.component';
import { ConfirmDialogComponent } from '../../shared/components/dialogs/confirm-dialog.component';
import { vi } from 'vitest';

const makeItem = (overrides: Partial<QueryCartItem> = {}): QueryCartItem => ({
  id: 'q1',
  title: 'Old',
  sql: 'SELECT 1',
  createdAt: '2026-01-01T00:00:00Z',
  kind: QUERY_CART_ITEM_KIND,
  ...overrides,
});

describe('QueryCartComponent', () => {
  let fixture: ComponentFixture<QueryCartComponent>;
  let component: QueryCartComponent;
  let mockCart: {
    items: Signal<QueryCartItem[]>;
    count: Signal<number>;
    clear: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
  };
  let mockDialog: { open: ReturnType<typeof vi.fn> };
  let mockProvisioning: { addToDashboard: ReturnType<typeof vi.fn> };
  let mockStore: { loadDashboard: ReturnType<typeof vi.fn> };
  let mockSnackBar: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockCart = {
      items: signal<QueryCartItem[]>([]).asReadonly(),
      count: computed(() => 0),
      clear: vi.fn(),
      remove: vi.fn(),
      rename: vi.fn(),
    };
    mockDialog = { open: vi.fn() };
    mockProvisioning = { addToDashboard: vi.fn() };
    mockStore = { loadDashboard: vi.fn() };
    mockSnackBar = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [QueryCartComponent],
      providers: [
        { provide: QueryCartService, useValue: mockCart },
        { provide: QueryCartProvisioningService, useValue: mockProvisioning },
        { provide: DashboardStore, useValue: mockStore },
        { provide: MatDialog, useValue: mockDialog },
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    })
      .overrideProvider(MatSnackBar, { useValue: mockSnackBar })
      .compileComponents();

    fixture = TestBed.createComponent(QueryCartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should clear cart via dialog if confirmed', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(true) });
    component.clear();
    expect(mockDialog.open).toHaveBeenCalledWith(ConfirmDialogComponent, expect.anything());
    expect(mockCart.clear).toHaveBeenCalled();
  });

  it('should not clear cart via dialog if not confirmed', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(false) });
    component.clear();
    expect(mockDialog.open).toHaveBeenCalledWith(ConfirmDialogComponent, expect.anything());
    expect(mockCart.clear).not.toHaveBeenCalled();
  });

  it('should remove item', () => {
    const item = makeItem({ id: 'q1' });
    component.remove(item);
    expect(mockCart.remove).toHaveBeenCalledWith('q1');
  });

  it('should rename via dialog if confirmed', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of('New') });
    const item = makeItem({ id: 'q1', title: 'Old' });
    component.rename(item);
    expect(mockDialog.open).toHaveBeenCalledWith(PromptDialogComponent, expect.anything());
    expect(mockCart.rename).toHaveBeenCalledWith('q1', 'New');
  });

  it('should not rename via dialog if not confirmed', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(null) });
    const item = makeItem({ id: 'q1', title: 'Old' });
    component.rename(item);
    expect(mockDialog.open).toHaveBeenCalledWith(PromptDialogComponent, expect.anything());
    expect(mockCart.rename).not.toHaveBeenCalled();
  });

  it('should do nothing when adding to dashboard if no dashboardId', () => {
    component.addToDashboard(makeItem());
    expect(mockProvisioning.addToDashboard).not.toHaveBeenCalled();
  });

  it('should add to dashboard successfully', () => {
    fixture.componentRef.setInput('dashboardId', 'dash-1');
    fixture.detectChanges();

    mockProvisioning.addToDashboard.mockReturnValue(of({}));
    const item = makeItem({ id: 'q1', title: 'Test' });
    component.addToDashboard(item);

    expect(mockProvisioning.addToDashboard).toHaveBeenCalledWith(item, 'dash-1');
    expect(mockSnackBar.open).toHaveBeenCalledWith('Added query: Test', 'OK', { duration: 3000 });
    expect(mockStore.loadDashboard).toHaveBeenCalledWith('dash-1');
  });

  it('should show error when adding to dashboard fails', () => {
    fixture.componentRef.setInput('dashboardId', 'dash-1');
    fixture.detectChanges();

    mockProvisioning.addToDashboard.mockReturnValue(throwError(() => new Error('Error')));
    const item = makeItem({ id: 'q1', title: 'Test' });
    component.addToDashboard(item);

    expect(mockProvisioning.addToDashboard).toHaveBeenCalledWith(item, 'dash-1');
    expect(mockSnackBar.open).toHaveBeenCalledWith('Failed to add query to dashboard', 'Close');
  });

  it('should preview sql (short)', () => {
    const sql = 'SELECT * FROM test';
    expect(component.previewSql(sql)).toBe('SELECT * FROM test');
  });

  it('should preview sql (long)', () => {
    const sql = 'SELECT * FROM test WHERE 1 = 1 AND 2 = 2 AND 3 = 3 AND 4 = 4 AND 5 = 5 AND 6 = 6';
    expect(component.previewSql(sql)).toBe(
      'SELECT * FROM test WHERE 1 = 1 AND 2 = 2 AND 3 = 3 AND 4 = 4 AND 5 = 5...',
    );
  });

  it('should restore focus on destroy and when restoreFocus is called with an element or null', () => {
    const btn = document.createElement('button');
    const focusSpy = vi.spyOn(btn, 'focus');
    component.restoreFocus(btn);
    expect(focusSpy).toHaveBeenCalled();
    component.restoreFocus(null);
    component.ngOnDestroy();

    Object.defineProperty(document, 'activeElement', { value: null, configurable: true });
    const f2 = TestBed.createComponent(QueryCartComponent);
    mockDialog.open.mockReturnValue({ afterClosed: () => of(false) });
    f2.componentInstance.clear();
    f2.componentInstance.rename(makeItem());
    delete (document as unknown as Record<string, unknown>)['activeElement'];
  });
});
