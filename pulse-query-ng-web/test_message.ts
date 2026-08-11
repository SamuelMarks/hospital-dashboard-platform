import { signal } from '@angular/core';
import { form, required, minLength } from '@angular/forms/signals';

const myModel = signal({ name: '' });
const myForm = form(myModel, (f) => {
  required(f.name, { message: 'Name is required' });
  minLength(f.name, 3, { message: 'Name must be at least 3 characters' });
});
console.log('done');
