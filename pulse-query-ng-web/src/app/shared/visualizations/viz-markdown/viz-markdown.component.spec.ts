/**
 * @fileoverview Unit tests for VizMarkdownComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VizMarkdownComponent } from './viz-markdown.component';
import { By } from '@angular/platform-browser';

describe('VizMarkdownComponent', () => {
  let component: VizMarkdownComponent;
  let fixture: ComponentFixture<VizMarkdownComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VizMarkdownComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VizMarkdownComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('content', '');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should escape HTML tags in input', () => {
    fixture.componentRef.setInput('content', '<script>alert(1)</script>');
    fixture.detectChanges();

    const div = fixture.debugElement.query(By.css('.md-content')).nativeElement as HTMLElement;
    expect(div.innerHTML).not.toContain('<script>');
    expect(div.textContent).toContain('alert(1)');
  });

  it('should parse markdown headers', () => {
    fixture.componentRef.setInput('content', '# Heading 1');
    fixture.detectChanges();
    const h1 = fixture.debugElement.query(By.css('h1')).nativeElement as HTMLElement;
    expect(h1).toBeTruthy();
    expect(h1.textContent).toBe('Heading 1');
  });

  it('should parse multiple strong and italic spans and preserve asterisks inside inline code', () => {
    fixture.componentRef.setInput(
      'content',
      '**First** and **Second** with `SELECT * FROM table WHERE a * b > 0` and *italic*',
    );
    fixture.detectChanges();
    const strongs = fixture.debugElement.queryAll(By.css('strong'));
    expect(strongs.length).toBe(2);
    expect((strongs[0]?.nativeElement as HTMLElement).textContent).toBe('First');
    expect((strongs[1]?.nativeElement as HTMLElement).textContent).toBe('Second');
    const code = fixture.debugElement.query(By.css('code')).nativeElement as HTMLElement;
    expect(code.textContent).toBe('SELECT * FROM table WHERE a * b > 0');
    const em = fixture.debugElement.query(By.css('em')).nativeElement as HTMLElement;
    expect(em.textContent).toBe('italic');
  });

  it('should parse lists', () => {
    fixture.componentRef.setInput(
      'content',
      `- Item 1
- Item 2`,
    );
    fixture.detectChanges();
    const lis = fixture.debugElement.queryAll(By.css('li'));
    expect(lis.length).toBe(2);
  });

  it('should parse italics, code, and blockquotes', () => {
    fixture.componentRef.setInput(
      'content',
      `*Italic*
\`code\`
> quote`,
    );
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('em'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('code'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('blockquote'))).toBeTruthy();
  });

  it('should convert line breaks', () => {
    fixture.componentRef.setInput(
      'content',
      `Line1
Line2`,
    );
    fixture.detectChanges();
    const div = fixture.debugElement.query(By.css('.md-content')).nativeElement as HTMLElement;
    expect(div.innerHTML).toContain('<br>');
  });

  it('should parse Markdown pipe tables into responsive scrollable HTML tables', () => {
    fixture.componentRef.setInput(
      'content',
      `Executed directly on read-only DuckDB (2 rows returned in 3ms).

| dept | census | note |
| :--- | :---: | ---: |
| ICU \\| North | 42 | High |
| ER | 18 |

| Header without valid separator |
| invalid_sep |
| trailing_pipe_row |`,
    );
    fixture.detectChanges();
    const wrapper = fixture.debugElement.query(By.css('.md-table-wrapper'))
      ?.nativeElement as HTMLElement;
    expect(wrapper).toBeTruthy();
    const headers = wrapper.querySelectorAll('th');
    expect(headers.length).toBe(3);
    expect(headers[0]?.textContent).toBe('dept');
    const cells = wrapper.querySelectorAll('td');
    expect(cells.length).toBe(6);
    expect(cells[0]?.textContent).toBe('ICU | North');
    expect(cells[1]?.textContent).toBe('42');
    expect(cells[5]?.textContent).toBe('');
  });
});
