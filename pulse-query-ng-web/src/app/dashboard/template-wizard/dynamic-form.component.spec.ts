/**
 * @fileoverview Unit tests for DynamicFormComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DynamicFormComponent, isJsonSchema } from './dynamic-form.component';
import { By } from '@angular/platform-browser';
import { MatDatepickerInputEvent } from '@angular/material/datepicker';

describe('DynamicFormComponent', () => {
  let component: DynamicFormComponent;
  let fixture: ComponentFixture<DynamicFormComponent>;

  const mockSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      name: { type: 'string', title: 'Full Name' },
      age: { type: 'integer', minimum: 18 },
      role: { type: 'string', enum: ['Admin', 'User'] },
      active: { type: 'boolean', description: 'Active flag' },
    },
    required: ['name'],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DynamicFormComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DynamicFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('jsonSchema', mockSchema);
    fixture.detectChanges();
  });

  it('validates JsonSchema objects with isJsonSchema type guard', () => {
    expect(isJsonSchema(null)).toBe(false);
    expect(isJsonSchema('str')).toBe(false);
    expect(isJsonSchema({ type: 'object' })).toBe(true);
    expect(isJsonSchema({ type: 'object', properties: null })).toBe(false);
    expect(isJsonSchema({ type: 'object', properties: { a: { type: 'string' } } })).toBe(true);
  });

  it('should create fields based on schema', () => {
    expect(component.fieldKeys()).toEqual(['name', 'age', 'role', 'active']);
    expect(component.getValue('active')).toBe(false);
    expect(component.getHelpAriaLabel('active')).toBe('Help info for Active');
    expect(component.getHelpAriaLabel('name')).toBe('Help info for Full Name');
  });

  it('should apply required and min validators', () => {
    component.setFieldValue('name', '');
    expect(component.isValid()).toBe(false);
    expect(component.hasError('name', 'required')).toBe(true);

    component.setFieldValue('name', 'Alice');
    component.setFieldValue('age', 10);
    expect(component.isValid()).toBe(false);
    expect(component.hasError('age', 'min')).toBe(true);
  });

  it('should apply max validator when defined', () => {
    const schemaWithMax: Record<string, unknown> = {
      ...mockSchema,
      properties: {
        ...(mockSchema['properties'] as Record<string, unknown>),
        age: { type: 'integer', minimum: 18, maximum: 65 },
      },
    };
    fixture.componentRef.setInput('jsonSchema', schemaWithMax);
    fixture.detectChanges();

    component.setFieldValue('name', 'Alice');
    component.setFieldValue('age', 70);
    expect(component.hasError('age', 'max')).toBe(true);
  });

  it('should handle text and number DOM input events', () => {
    const nameInput = document.createElement('input');
    nameInput.value = 'Dr. Smith';
    const nameEvent = new Event('input');
    Object.defineProperty(nameEvent, 'target', { value: nameInput });
    component.onTextOrNumberInput('name', nameEvent);
    expect(component.getValue('name')).toBe('Dr. Smith');

    const ageInput = document.createElement('input');
    ageInput.value = '42';
    const ageEvent = new Event('input');
    Object.defineProperty(ageEvent, 'target', { value: ageInput });
    component.onTextOrNumberInput('age', ageEvent);
    expect(component.getValue('age')).toBe(42);

    ageInput.value = '';
    const emptyAgeEvent = new Event('input');
    Object.defineProperty(emptyAgeEvent, 'target', { value: ageInput });
    component.onTextOrNumberInput('age', emptyAgeEvent);
    expect(component.getValue('age')).toBe('');
  });

  it('should render correct control types', () => {
    expect(fixture.debugElement.query(By.css('mat-select'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('mat-checkbox'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('.help-icon-btn'))).toBeTruthy();
  });

  it('should emit value changes when valid', () =>
    new Promise<void>((done) => {
      component.formValueChange.subscribe((val) => {
        expect(val['name']).toBe('Test User');
        done();
      });

      component.patchValues({ name: 'Test User' });
    }));

  it('should emit invalid status when required field missing', () =>
    new Promise<void>((done) => {
      component.statusChange.subscribe((status) => {
        expect(status).toBe('INVALID');
        done();
      });
      component.patchValues({ name: '' });
    }));

  it('should handle empty schema gracefully', () => {
    const emptySchema: Record<string, unknown> = { type: 'object' };
    fixture.componentRef.setInput('jsonSchema', emptySchema);
    fixture.detectChanges();
    expect(component.fieldKeys().length).toBe(0);
    expect(component.values()).toEqual({});
    expect(component.errorsMap()).toEqual({});
    expect(fixture.debugElement.query(By.css('.empty-state'))).toBeTruthy();
  });

  it('should handle null schema input', () => {
    fixture.componentRef.setInput('jsonSchema', null);
    fixture.detectChanges();
    expect(component.fieldKeys().length).toBe(0);
    expect(component.parsedSchema()).toBeNull();
  });

  it('should render date picker with hint and handle dateChange', () => {
    const dateSchema: Record<string, unknown> = {
      type: 'object',
      properties: {
        start_date: { type: 'string', format: 'date', description: 'Pick a date' },
      },
      required: ['start_date'],
    };
    fixture.componentRef.setInput('jsonSchema', dateSchema);
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('mat-datepicker'))).toBeTruthy();
    const hint = fixture.debugElement.query(By.css('mat-hint'));
    expect((hint.nativeElement as HTMLElement).textContent).toContain('Pick a date');

    const testDate = new Date('2026-05-01T00:00:00Z');
    component.onDateChange('start_date', { value: testDate } as MatDatepickerInputEvent<Date>);
    expect(component.getValue('start_date')).toBe(testDate);
  });

  it('should format labels and detect errors', () => {
    expect(component.formatLabel('patient_count')).toBe('Patient Count');
    component.setFieldValue('name', '');
    expect(component.hasError('name', 'required')).toBe(true);
  });

  it('should return null for missing property and false for missing errors', () => {
    expect(component.getProperty('missing')).toBeNull();
    expect(component.hasError('missing', 'required')).toBe(false);
  });

  it('should apply max validator and handle string number conversion in errorsMap', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        score: { type: 'number', maximum: 5, default: 2 },
      },
    };
    fixture.componentRef.setInput('jsonSchema', schema);
    fixture.detectChanges();

    expect(component.getValue('score')).toBe(2);
    component.setFieldValue('score', '10');
    expect(component.hasError('score', 'max')).toBe(true);

    component.setFieldValue('score', 'not-a-number');
    expect(component.hasError('score', 'max')).toBe(false);
  });

  it('should convert Date values to ISO strings on emission', () =>
    new Promise<void>((done) => {
      const schema: Record<string, unknown> = {
        type: 'object',
        properties: {
          start_date: { type: 'string', format: 'date' },
        },
        required: ['start_date'],
      };
      fixture.componentRef.setInput('jsonSchema', schema);
      fixture.detectChanges();

      component.formValueChange.subscribe((val) => {
        expect(val['start_date']).toBe('2023-01-01');
        done();
      });

      component.patchValues({ start_date: new Date('2023-01-01T00:00:00Z') });
    }));
});
