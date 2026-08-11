import { signal } from '@angular/core';
import { form } from '@angular/forms/signals';

const myModel = signal({ items: [] as string[] });
const myForm = form(myModel, (f) => {});
for (const item of myForm.items()) {
  console.log(item());
}
