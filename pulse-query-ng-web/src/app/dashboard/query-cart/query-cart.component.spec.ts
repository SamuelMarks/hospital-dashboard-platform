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
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { PromptDialogComponent } from '../../shared/components/dialogs/prompt-dialog.component';

describe('QueryCartComponent', () => {
  let fixture: ComponentFixture<QueryCartComponent>;
  let component: QueryCartComponent;
  let mockCart: any;
  let mockDialog: any;

  beforeEach(async () => {
    mockCart = {
      items: signal([]).asReadonly(),
      count: computed(() => 0),
      clear: vi.fn(),
      remove: vi.fn(),
      rename: vi.fn(),
    };
    mockDialog = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [QueryCartComponent, NoopAnimationsModule],
      providers: [
        { provide: QueryCartService, useValue: mockCart },
        { provide: QueryCartProvisioningService, useValue: { addToDashboard: vi.fn() } },
        { provide: DashboardStore, useValue: { loadDashboard: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QueryCartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should rename via dialog', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of('New') });
    const item = { id: 'q1', title: 'Old' } as any;
    component.rename(item);
    expect(mockDialog.open).toHaveBeenCalledWith(PromptDialogComponent, expect.anything());
    expect(mockCart.rename).toHaveBeenCalledWith('q1', 'New');
  });
});
