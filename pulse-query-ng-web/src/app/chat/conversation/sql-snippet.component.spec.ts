import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SqlSnippetComponent } from './sql-snippet.component';
import { By } from '@angular/platform-browser';

describe('SqlSnippetComponent', () => {
  let component: SqlSnippetComponent;
  let fixture: ComponentFixture<SqlSnippetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SqlSnippetComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SqlSnippetComponent);
    component = fixture.componentInstance;
    // Set Input
    fixture.componentRef.setInput('sql', 'SELECT * FROM table');
    fixture.detectChanges();
  });

  it('should highlight keywords', () => {
    const codeBlock = fixture.debugElement.query(By.css('.code-block'));
    expect(codeBlock.nativeElement.innerHTML).toContain('<span class="keyword">SELECT</span>');
  });

  it('should emit run event', () => {
    let emittedSql = '';
    component.run.subscribe(s => emittedSql = s);

    const btn = fixture.debugElement.queryAll(By.css('button'))[1]; // Run button is second
    btn.triggerEventHandler('click', null);

    expect(emittedSql).toBe('SELECT * FROM table');
  });
});