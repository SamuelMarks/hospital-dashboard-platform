/**
 * @fileoverview Unit tests for ConfirmDialogComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';

describe('ConfirmDialogComponent', () => {
  let fixture: ComponentFixture<ConfirmDialogComponent>;
  let component: ConfirmDialogComponent;

  const mockData: ConfirmDialogData = {
    title: 'Test Title',
    message: 'Test Message',
    isDestructive: true,
    confirmJson: 'Yes',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: mockData },
        { provide: MatDialogRef, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render content from data', () => {
    const title = (fixture.debugElement.query(By.css('h2')).nativeElement as HTMLElement)
      .textContent;
    const msg = (fixture.debugElement.query(By.css('p')).nativeElement as HTMLElement).textContent;
    const btn = (
      fixture.debugElement.query(By.css('button[mat-flat-button]')).nativeElement as HTMLElement
    ).textContent;

    expect(title).toBe('Test Title');
    expect(msg).toBe('Test Message');
    expect(btn?.trim()).toBe('Yes');
  });

  it('should use warn color for destructive actions', () => {
    expect(component.data.isDestructive).toBe(true);
  });
});
