import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QueryCartComponent } from './query-cart.component';
import { QueryCartService } from '../../global/query-cart.service';
import { QueryCartProvisioningService } from '../query-cart-provisioning.service';
import { DashboardStore } from '../dashboard.store';
import { type QueryCartItem } from '../../global/query-cart.models';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { computed, signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { PromptDialogComponent } from '../../shared/components/dialogs/prompt-dialog.component';
import { ConfirmDialogComponent } from '../../shared/components/dialogs/confirm-dialog.component';

describe('QueryCartComponent', () => {
  let fixture: ComponentFixture<QueryCartComponent>;
  let component: QueryCartComponent;
  let mockCart: any;
  let mockDialog: any;
  let mockProvisioning: any;
  let mockStore: any;
  let snackBar: MatSnackBar;

  beforeEach(async () => {
    mockCart = {
      items: signal([]).asReadonly(),
      count: computed(() => 0),
      clear: vi.fn(),
      remove: vi.fn(),
      rename: vi.fn(),
    };
    mockDialog = { open: vi.fn() };
    mockProvisioning = { addToDashboard: vi.fn() };
    mockStore = { loadDashboard: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [QueryCartComponent, NoopAnimationsModule],
      providers: [
        { provide: QueryCartService, useValue: mockCart },
        { provide: QueryCartProvisioningService, useValue: mockProvisioning },
        { provide: DashboardStore, useValue: mockStore },
        { provide: MatDialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QueryCartComponent);
    component = fixture.componentInstance;
    snackBar = fixture.debugElement.injector.get(MatSnackBar);
    vi.spyOn(snackBar, 'open').mockImplementation((() => {}) as any);
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
    const item = { id: 'q1' } as QueryCartItem;
    component.remove(item);
    expect(mockCart.remove).toHaveBeenCalledWith('q1');
  });

  it('should rename via dialog if confirmed', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of('New') });
    const item = { id: 'q1', title: 'Old' } as QueryCartItem;
    component.rename(item);
    expect(mockDialog.open).toHaveBeenCalledWith(PromptDialogComponent, expect.anything());
    expect(mockCart.rename).toHaveBeenCalledWith('q1', 'New');
  });

  it('should not rename via dialog if not confirmed', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(null) });
    const item = { id: 'q1', title: 'Old' } as QueryCartItem;
    component.rename(item);
    expect(mockDialog.open).toHaveBeenCalledWith(PromptDialogComponent, expect.anything());
    expect(mockCart.rename).not.toHaveBeenCalled();
  });

  it('should do nothing when adding to dashboard if no dashboardId', () => {
    // dashboardId is null by default
    component.addToDashboard({} as QueryCartItem);
    expect(mockProvisioning.addToDashboard).not.toHaveBeenCalled();
  });

  it('should add to dashboard successfully', () => {
    Object.defineProperty(component, 'dashboardId', { value: signal('dash-1'), writable: true });
    fixture.detectChanges();

    mockProvisioning.addToDashboard.mockReturnValue(of({}));
    const item = { id: 'q1', title: 'Test' } as QueryCartItem;
    component.addToDashboard(item);

    expect(mockProvisioning.addToDashboard).toHaveBeenCalledWith(item, 'dash-1');
    expect(snackBar.open).toHaveBeenCalledWith('Added query: Test', 'OK', { duration: 3000 });
    expect(mockStore.loadDashboard).toHaveBeenCalledWith('dash-1');
  });

  it('should show error when adding to dashboard fails', () => {
    Object.defineProperty(component, 'dashboardId', { value: signal('dash-1'), writable: true });
    fixture.detectChanges();

    mockProvisioning.addToDashboard.mockReturnValue(throwError(() => new Error('Error')));
    const item = { id: 'q1', title: 'Test' } as QueryCartItem;
    component.addToDashboard(item);

    expect(mockProvisioning.addToDashboard).toHaveBeenCalledWith(item, 'dash-1');
    expect(snackBar.open).toHaveBeenCalledWith('Failed to add query to dashboard', 'Close');
  });

  it('should preview sql (short)', () => {
    const sql = 'SELECT * FROM test';
    expect(component.previewSql(sql)).toBe('SELECT * FROM test');
  });

  it('should preview sql (long)', () => {
    const sql = 'SELECT * FROM test WHERE 1 = 1 AND 2 = 2 AND 3 = 3 AND 4 = 4 AND 5 = 5 AND 6 = 6';
    expect(component.previewSql(sql)).toBe('SELECT * FROM test WHERE 1 = 1 AND 2 = 2 AND 3 = 3 AND 4 = 4 AND 5 = 5...');
  });
});
