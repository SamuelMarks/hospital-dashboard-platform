/** 
 * @fileoverview Unit tests for DynamicFormComponent. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { DynamicFormComponent } from './dynamic-form.component'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { By } from '@angular/platform-browser'; 
import { FormControl } from '@angular/forms'; 

describe('DynamicFormComponent', () => { 
  let component: DynamicFormComponent; 
  let fixture: ComponentFixture<DynamicFormComponent>; 

  const mockSchema = { 
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
    
    fixture.componentRef.setInput('jsonSchema', mockSchema); 
    fixture.detectChanges(); 
  }); 

  it('should create controls based on schema', () => { 
    expect(component.form.contains('name')).toBe(true); 
    expect(component.form.contains('age')).toBe(true); 
    expect(component.fieldKeys().length).toBe(4); 
  }); 

  it('should apply required and min validators', () => { 
    // Fix: Double cast to handle AbstractControl vs FormControl overlap issues in tests
    const nameCtrl = component.form.get('name') as unknown as FormControl; 
    nameCtrl.setValue(''); 
    expect(nameCtrl.valid).toBe(false); 
    expect(nameCtrl.hasError('required')).toBe(true); 

    const ageCtrl = component.form.get('age') as unknown as FormControl; 
    ageCtrl.setValue(10); 
    expect(ageCtrl.valid).toBe(false); 
    expect(ageCtrl.hasError('min')).toBe(true); 
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
});