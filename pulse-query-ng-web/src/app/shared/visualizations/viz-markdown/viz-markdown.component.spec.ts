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

  it('should parse strong text', () => {
    fixture.componentRef.setInput('content', '**Bold**');
    fixture.detectChanges();
    const strong = fixture.debugElement.query(By.css('strong')).nativeElement as HTMLElement;
    expect(strong).toBeTruthy();
    expect(strong.textContent).toBe('Bold');
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
});
