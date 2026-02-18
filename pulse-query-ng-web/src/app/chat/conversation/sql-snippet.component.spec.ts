import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SIGNAL, signalSetFn } from '@angular/core/primitives/signals';
import { SqlSnippetComponent } from './sql-snippet.component';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

describe('SqlSnippetComponent', () => {
  let component: SqlSnippetComponent;
  let fixture: ComponentFixture<SqlSnippetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SqlSnippetComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SqlSnippetComponent);
    component = fixture.componentInstance;
    setInputSignal(component, 'sql', 'SELECT * FROM table');
    fixture.detectChanges();
  });

  it('should highlight keywords via method', () => {
    const html = component.highlightedSql;
    expect(html).toContain('<span class="keyword">SELECT</span>');
  });

  it('should render highlighted code', () => {
    const codeBlock = fixture.debugElement.query(By.css('.code-block'));
    expect(codeBlock.nativeElement.innerHTML).toContain('<span class="keyword">SELECT</span>');
  });

  it('should emit run event', () => {
    let emittedSql = '';
    component.run.subscribe((s) => (emittedSql = s));

    const btn = fixture.debugElement.queryAll(By.css('button'))[1]; // Run button is second
    btn.triggerEventHandler('click', null);

    expect(emittedSql).toBe('SELECT * FROM table');
  });

  it('should copy SQL to clipboard', async () => {
    const writeSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeSpy } });

    component.copy();
    expect(writeSpy).toHaveBeenCalledWith('SELECT * FROM table');
  });

  it('should highlight numbers and strings', () => {
    setInputSignal(component, 'sql', "SELECT count(*) FROM t WHERE id = 5 AND name = 'bob'");
    fixture.detectChanges();

    const html = component.highlightedSql;
    expect(html).toContain('class="function"');
    expect(html).toContain('class="number"');
    expect(html).toContain('class="string"');
  });

  it('should handle empty sql', () => {
    setInputSignal(component, 'sql', '');
    fixture.detectChanges();
    expect(component.highlightedSql).toBe('');
  });
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
