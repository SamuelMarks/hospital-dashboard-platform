import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PromptDialogComponent } from './prompt-dialog.component';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

describe('PromptDialogComponent', () => {
  let fixture: ComponentFixture<PromptDialogComponent>;
  let component: PromptDialogComponent;
  let mockRef: any;

  beforeEach(async () => {
    mockRef = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [PromptDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { title: 'Input', value: 'Init' } },
        { provide: MatDialogRef, useValue: mockRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PromptDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initialize with value', () => {
    expect(component.value()).toBe('Init');
  });

  it('should close with value on save', () => {
    component.value.set('New Value');
    component.save();
    expect(mockRef.close).toHaveBeenCalledWith('New Value');
  });

  it('should not close on invalid empty save', () => {
    component.value.set('   ');
    component.save();
    expect(mockRef.close).not.toHaveBeenCalled();
  });

  it('should handle missing optional data', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PromptDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { title: 'Input', value: null } },
        { provide: MatDialogRef, useValue: mockRef },
      ],
    }).compileComponents();

    const newFixture = TestBed.createComponent(PromptDialogComponent);
    const newComponent = newFixture.componentInstance;
    newFixture.detectChanges();
    expect(newComponent.value()).toBe('');
  });

  it('should handle optional data like message', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PromptDialogComponent, NoopAnimationsModule],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { title: 'Input', value: null, message: 'Hint msg' },
        },
        { provide: MatDialogRef, useValue: mockRef },
      ],
    }).compileComponents();

    const newFixture = TestBed.createComponent(PromptDialogComponent);
    const newComponent = newFixture.componentInstance;
    newFixture.detectChanges();
    expect(newComponent.data.message).toBe('Hint msg');
  });
});
