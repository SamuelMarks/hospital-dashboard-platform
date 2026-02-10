/** 
 * @fileoverview Unit tests for VizMarkdownComponent. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { signal } from '@angular/core';
import { VizMarkdownComponent } from './viz-markdown.component'; 
import { By } from '@angular/platform-browser'; 

describe('VizMarkdownComponent', () => { 
  let component: VizMarkdownComponent; 
  let fixture: ComponentFixture<VizMarkdownComponent>; 
  let contentSig: any;

  beforeEach(async () => { 
    await TestBed.configureTestingModule({ 
      imports: [VizMarkdownComponent] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(VizMarkdownComponent); 
    component = fixture.componentInstance; 
    contentSig = signal('');
    (component as any).content = contentSig;
    fixture.detectChanges(); 
  }); 

  it('should create', () => { 
    expect(component).toBeTruthy(); 
  }); 

  it('should escape HTML tags in input', () => { 
    contentSig.set('<script>alert(1)</script>'); 
    fixture.detectChanges(); 
    
    // The content is sanitized, so innerHTML might strip it or encode it
    const div = fixture.debugElement.query(By.css('.md-content')).nativeElement; 
    expect(div.innerHTML).not.toContain('<script>'); 
    expect(div.textContent).toContain('alert(1)'); 
  }); 

  it('should parse markdown headers', () => { 
    contentSig.set('# Heading 1'); 
    fixture.detectChanges(); 
    const h1 = fixture.debugElement.query(By.css('h1')); 
    expect(h1).toBeTruthy(); 
    expect(h1.nativeElement.textContent).toBe('Heading 1'); 
  }); 

  it('should parse strong text', () => { 
    contentSig.set('**Bold**'); 
    fixture.detectChanges(); 
    const strong = fixture.debugElement.query(By.css('strong')); 
    expect(strong).toBeTruthy(); 
    expect(strong.nativeElement.textContent).toBe('Bold'); 
  }); 

  it('should parse lists', () => { 
    contentSig.set('- Item 1\n- Item 2'); 
    fixture.detectChanges(); 
    const lis = fixture.debugElement.queryAll(By.css('li')); 
    expect(lis.length).toBe(2); 
  }); 

  it('should parse italics, code, and blockquotes', () => {
    contentSig.set('*Italic*\n`code`\n> quote');
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('em'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('code'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('blockquote'))).toBeTruthy();
  });

  it('should convert line breaks', () => {
    contentSig.set('Line1\nLine2');
    fixture.detectChanges();
    const div = fixture.debugElement.query(By.css('.md-content')).nativeElement;
    expect(div.innerHTML).toContain('<br>');
  });
}); 
