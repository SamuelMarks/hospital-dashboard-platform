import { signal } from '@angular/core';
import { form, required, pattern, applyEach, schema, validate } from '@angular/forms/signals';

const myModel = signal({
  body: '',
});

const myForm = form(myModel, (f) => {
  validate(f.body, (ctx) => {
    const value = ctx.value();
    if (!value) return null;
    try {
      JSON.parse(value);
      return null;
    } catch {
      return { kind: 'invalidJson', message: 'invalid' };
    }
  });
});
console.log('done');
