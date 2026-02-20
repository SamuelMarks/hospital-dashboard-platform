import { Component, Inject, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface PromptDialogData {
  title: string;
  message?: string;
  value: string;
  label?: string;
}

@Component({
  selector: 'app-prompt-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.message) {
        <p class="mb-4 text-sm text-secondary">{{ data.message }}</p>
      }
      <mat-form-field appearance="outline" class="w-full">
        <mat-label>{{ data.label || 'Value' }}</mat-label>
        <input matInput [(ngModel)]="value" cdkFocusInitial (keydown.enter)="save()" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="!value().trim()">
        Save
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .text-secondary {
        color: var(--sys-text-secondary);
      }
      .w-full {
        width: 100%;
      }
    `,
  ],
})
export class PromptDialogComponent {
  readonly value = signal('');

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: PromptDialogData,
    public dialogRef: MatDialogRef<PromptDialogComponent>,
  ) {
    this.value.set(data.value || '');
  }

  save() {
    if (this.value().trim()) {
      this.dialogRef.close(this.value());
    }
  }
}
