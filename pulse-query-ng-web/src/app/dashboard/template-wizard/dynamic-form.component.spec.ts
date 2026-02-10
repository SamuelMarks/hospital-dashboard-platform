/** 
 * @fileoverview Unit tests for DynamicFormComponent. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { SimpleChange } from '@angular/core';
import { SIGNAL, signalSetFn } from '@angular/core/primitives/signals';
import { DynamicFormComponent } from './dynamic-form.component'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { By } from '@angular/platform-browser'; 
import { FormControl } from '@angular/forms'; 

describe('DynamicFormComponent', () => { 
  let component: DynamicFormComponent; 
  let fixture: ComponentFixture<DynamicFormComponent>; 

  const mockSchema: Record<string, unknown> = { 
    type: 'object', 
    properties: { 
      name: { type: 'string', title: 'Full Name' }, 
      age: { type: 'integer', minimum: 18 }, 
      role: { type: 'string', enum: ['Admin', 'User'] }, 
      active: { type: 'boolean' } 
    }, 
    required: ['name'] 
  }; 

  beforeEach(async () => { 
    await TestBed.configureTestingModule({ 
      imports: [DynamicFormComponent, NoopAnimationsModule] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(DynamicFormComponent); 
    component = fixture.componentInstance; 
    setInputSignal(component, 'jsonSchema', mockSchema);
    component.ngOnChanges({ jsonSchema: new SimpleChange(null, mockSchema, true) });
    fixture.detectChanges(); 
  }); 

  it('should create controls based on schema', () => { 
    expect(component.form.contains('name')).toBe(true); 
    expect(component.form.contains('age')).toBe(true); 
    expect(component.fieldKeys().length).toBe(4); 
  }); 

  it('should apply required and min validators', () => { 
    // Fix: Double cast to handle AbstractControl vs FormControl overlap issues in tests
    const nameCtrl = component.form.get('name'); 
    if (!nameCtrl) {
      throw new Error('Missing name control');
    }
    const typedNameCtrl = nameCtrl as unknown as FormControl<string>;
    typedNameCtrl.setValue(''); 
    expect(typedNameCtrl.valid).toBe(false); 
    expect(typedNameCtrl.hasError('required')).toBe(true); 

    const ageCtrl = component.form.get('age'); 
    if (!ageCtrl) {
      throw new Error('Missing age control');
    }
    const typedAgeCtrl = ageCtrl as unknown as FormControl<number>;
    typedAgeCtrl.setValue(10); 
    expect(typedAgeCtrl.valid).toBe(false); 
    expect(typedAgeCtrl.hasError('min')).toBe(true); 
  }); 
  
  it('should apply max validator when defined', () => {
    const schemaWithMax: Record<string, unknown> = {
      ...mockSchema,
      properties: {
        ...(mockSchema['properties'] as Record<string, unknown>),
        age: { type: 'integer', minimum: 18, maximum: 65 }
      }
    };
    setInputSignal(component, 'jsonSchema', schemaWithMax);
    component.ngOnChanges({ jsonSchema: new SimpleChange(mockSchema, schemaWithMax, false) });
    fixture.detectChanges();

    const ageCtrl = component.form.get('age');
    if (!ageCtrl) {
      throw new Error('Missing age control');
    }
    const typedAgeCtrl = ageCtrl as unknown as FormControl<number>;
    typedAgeCtrl.setValue(70);
    expect(typedAgeCtrl.hasError('max')).toBe(true);
  });

  it('should render correct control types', () => { 
    expect(fixture.debugElement.query(By.css('mat-select'))).toBeTruthy(); // role enum
    expect(fixture.debugElement.query(By.css('mat-checkbox'))).toBeTruthy(); // active bool
  }); 

  it('should emit value changes when valid', () => new Promise<void>(done => { 
    component.formValueChange.subscribe(val => { 
      expect(val['name']).toBe('Test User'); 
      done(); 
    }); 

    component.form.patchValue({ name: 'Test User' }); 
  })); 

  it('should emit invalid status when required field missing', () => new Promise<void>(done => {
    component.statusChange.subscribe(status => {
      expect(status).toBe('INVALID');
      done();
    });
    component.form.patchValue({ name: '' });
  }));

  it('should handle empty schema gracefully', () => {
    const emptySchema: Record<string, unknown> = { type: 'object' };
    setInputSignal(component, 'jsonSchema', emptySchema);
    component.ngOnChanges({ jsonSchema: new SimpleChange(mockSchema, emptySchema, false) });
    fixture.detectChanges();
    expect(component.fieldKeys().length).toBe(0);
    expect(fixture.debugElement.query(By.css('.empty-state'))).toBeTruthy();
  });
  
  it('should ignore ngOnChanges when jsonSchema is not provided', () => {
    const rebuildSpy = vi.spyOn(component as any, 'rebuildForm');
    component.ngOnChanges({});
    expect(rebuildSpy).not.toHaveBeenCalled();
  });
  
  it('should handle null schema input', () => {
    setInputSignal(component, 'jsonSchema', null);
    component.ngOnChanges({ jsonSchema: new SimpleChange(mockSchema, null, false) });
    fixture.detectChanges();
    expect(component.fieldKeys().length).toBe(0);
  });

  it('should render date picker with hint', () => {
    const dateSchema: Record<string, unknown> = {
      type: 'object',
      properties: {
        start_date: { type: 'string', format: 'date', description: 'Pick a date' }
      },
      required: ['start_date']
    };
    setInputSignal(component, 'jsonSchema', dateSchema);
    component.ngOnChanges({ jsonSchema: new SimpleChange(mockSchema, dateSchema, false) });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('mat-datepicker'))).toBeTruthy();
    const hint = fixture.debugElement.query(By.css('mat-hint'));
    expect(hint.nativeElement.textContent).toContain('Pick a date');
  });

  it('should format labels and detect errors', () => {
    expect(component.formatLabel('patient_count')).toBe('Patient Count');
    const ctrl = component.form.get('name');
    if (!ctrl) {
      throw new Error('Missing name control');
    }
    const typedCtrl = ctrl as unknown as FormControl<string>;
    typedCtrl.setValue('');
    expect(component.hasError('name', 'required')).toBe(true);
  });
  
  it('should return null for missing property and false for missing errors', () => {
    expect(component.getProperty('missing')).toBeNull();
    expect(component.hasError('missing', 'required')).toBe(false);
  });

  it('should apply max validator when configured', () => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        score: { type: 'number', maximum: 5 }
      }
    };
    setInputSignal(component, 'jsonSchema', schema);
    component.ngOnChanges({ jsonSchema: new SimpleChange(mockSchema, schema, false) });
    fixture.detectChanges();

    const ctrl = component.form.get('score');
    if (!ctrl) {
      throw new Error('Missing score control');
    }
    const typedCtrl = ctrl as unknown as FormControl<number>;
    typedCtrl.setValue(10);
    expect(typedCtrl.hasError('max')).toBe(true);
  });

  it('should return null for missing property', () => {
    expect(component.getProperty('missing')).toBeNull();
  });

  it('should convert Date values to ISO strings', () => new Promise<void>(done => {
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        start_date: { type: 'string', format: 'date' }
      },
      required: ['start_date']
    };
    setInputSignal(component, 'jsonSchema', schema);
    component.ngOnChanges({ jsonSchema: new SimpleChange(mockSchema, schema, false) });
    fixture.detectChanges();

    component.formValueChange.subscribe(val => {
      expect(val['start_date']).toBe('2023-01-01');
      done();
    });

    component.form.patchValue({ start_date: new Date('2023-01-01T00:00:00Z') });
  }));
});

function setInputSignal(component: any, key: string, value: unknown): void {
  const current = component[key];
  const node = current?.[SIGNAL];
  if (node) {
    if (typeof node.applyValueToInputSignal === 'function') {
      node.applyValueToInputSignal(node, value);
    } else {
      signalSetFn(node, value as never);
    }
  } else {
    component[key] = value;
  }
}
