import { Component, signal } from '@angular/core';
import { form, required, minLength, FormRoot, FormField } from '@angular/forms/signals';

@Component({
  selector: 'app-test',
  imports: [FormRoot, FormField],
  template: `
    <form [formRoot]="myForm">
      <input [formField]="myForm.name" />
    </form>
  `,
})
export class TestComponent {
  myModel = signal({ name: '' });
  myForm = form(this.myModel, (f) => {
    required(f.name);
    minLength(f.name, 3);
  });
}
