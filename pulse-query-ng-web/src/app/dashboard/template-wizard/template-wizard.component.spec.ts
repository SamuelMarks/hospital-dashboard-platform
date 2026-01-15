import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TemplateWizardComponent } from './template-wizard.component';
import { DashboardsService, ExecutionService, TemplatesService, TemplateResponse } from '../../api-client';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { ReactiveFormsModule } from '@angular/forms';

describe('TemplateWizardComponent', () => {
  let component: TemplateWizardComponent;
  let fixture: ComponentFixture<TemplateWizardComponent>;
  
  let mockDashApi: any;
  let mockExecApi: any;
  let mockTemplatesApi: any;
  let mockDialogRef: any;

  const mockTemplates: TemplateResponse[] = [
    { id: 't1', title: 'Admissions', category: 'Operational', sql_template: 'SELECT 1' },
    { id: 't2', title: 'Revenue', category: 'Financial', sql_template: 'SELECT 2' }
  ];

  beforeEach(async () => {
    mockDashApi = {
        createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn(),
        updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn(),
        deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: vi.fn()
    };
    mockExecApi = {
        refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi.fn()
    };
    mockTemplatesApi = {
        listTemplatesApiV1TemplatesGet: vi.fn()
    };
    mockDialogRef = { close: vi.fn() };

    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
        of({ id: 'draft-1', dashboard_id: 'dash-1', title: 'Draft', type: 'SQL', visualization: 'table', config: {} })
    );
    mockTemplatesApi.listTemplatesApiV1TemplatesGet.mockReturnValue(of(mockTemplates));

    await TestBed.configureTestingModule({
      imports: [TemplateWizardComponent, NoopAnimationsModule, ReactiveFormsModule],
      providers: [
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: ExecutionService, useValue: mockExecApi },
        { provide: TemplatesService, useValue: mockTemplatesApi },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { dashboardId: 'dash-1' } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TemplateWizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should validate form and enable/disable next button', () => {
    expect(component.selectionForm.invalid).toBe(false); // Initially valid as mode is predefined

    component.selectTemplate(mockTemplates[0]);
    expect(component.selectionForm.valid).toBe(true);

    component.selectionForm.patchValue({ mode: 'custom', rawSql: '' });
    expect(component.selectionForm.invalid).toBe(true);

    component.selectionForm.patchValue({ rawSql: 'SELECT 1' });
    expect(component.selectionForm.valid).toBe(true);
  });

  it('should parse parameters correctly', () => {
    component.selectionForm.patchValue({ mode: 'custom', rawSql: "SELECT {{var}}" });
    component.parseParams();
    expect(component.paramsSchema()).toEqual({});
    expect(component.paramsValid()).toBe(true);   
  });

  it('should save widget with template title', () => {
    component.templates.set(mockTemplates);
    component.selectTemplate(mockTemplates[0]);
    // Ensure the final SQL signal is set as that is what saveWidget uses
    component.finalSql.set('SELECT 1');
    
    // Must invoke create first to set draft ID if not already set by ngOnInit
    if (!component.draftWidgetId()) {
        (component as any).createDraftWidget();
    }
    
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));

    component.saveWidget();

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
        'draft-1',
        expect.objectContaining({
            title: 'Admissions',
            config: { query: 'SELECT 1' }
        })
    );
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });
});