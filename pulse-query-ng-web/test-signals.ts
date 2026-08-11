import { signal } from '@angular/core';
import { form, required, minLength } from '@angular/forms/signals';

const myModel = signal({ name: '' });
const myForm = form(myModel, (f) => {
  required(f.name);
  minLength(f.name, 3);
});
console.log('done');
