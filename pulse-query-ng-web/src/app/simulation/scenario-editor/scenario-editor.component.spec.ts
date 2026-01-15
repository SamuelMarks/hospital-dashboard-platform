import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScenarioEditorComponent } from './scenario-editor.component';
import { SimulationStore } from '../simulation.service';
import { signal } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';

describe('ScenarioEditorComponent', () => {
  let component: ScenarioEditorComponent;
  let fixture: ComponentFixture<ScenarioEditorComponent>;
  let mockStore: any;

  beforeEach(async () => {
    mockStore = {
      capacityMap: signal({ 'ICU': 10, 'Ward': 20 }),
      demandSql: signal('SELECT 1'),
      results: signal(null),
      isRunning: signal(false),
      error: signal(null),
      updateCapacity: vi.fn(),
      runScenario: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [ScenarioEditorComponent, NoopAnimationsModule],
      providers: [
        { provide: SimulationStore, useValue: mockStore }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ScenarioEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render capacity sliders', () => {
    const labels = fixture.debugElement.queryAll(By.css('.unit-label'));
    expect(labels.length).toBe(2);
    expect(labels[0].nativeElement.textContent).toContain('ICU');
  });

  it('should call store.runScenario on button click', () => {
    const btn = fixture.debugElement.query(By.css('button'));
    btn.triggerEventHandler('click', null);
    expect(mockStore.runScenario).toHaveBeenCalled();
  });

  it('should show results table when data present', () => {
    mockStore.results.set([ { Service: 'A', Unit: 'U', Patient_Count: 5 }]);
    fixture.detectChanges();
    
    const table = fixture.debugElement.query(By.css('viz-table'));
    expect(table).toBeTruthy();
  });
});