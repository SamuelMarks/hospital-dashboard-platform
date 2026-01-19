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
      imports: [VizMarkdownComponent] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(VizMarkdownComponent); 
    component = fixture.componentInstance; 
    fixture.detectChanges(); 
  }); 

  it('should create', () => { 
    expect(component).toBeTruthy(); 
  }); 

  it('should escape HTML tags in input', () => { 
    fixture.componentRef.setInput('content', '<script>alert(1)</script>'); 
    fixture.detectChanges(); 
    
    // The content is sanitized, so innerHTML might strip it or encode it
    const div = fixture.debugElement.query(By.css('.md-content')).nativeElement; 
    expect(div.innerHTML).not.toContain('<script>'); 
    expect(div.textContent).toContain('alert(1)'); 
  }); 

  it('should parse markdown headers', () => { 
    fixture.componentRef.setInput('content', '# Heading 1'); 
    fixture.detectChanges(); 
    const h1 = fixture.debugElement.query(By.css('h1')); 
    expect(h1).toBeTruthy(); 
    expect(h1.nativeElement.textContent).toBe('Heading 1'); 
  }); 

  it('should parse strong text', () => { 
    fixture.componentRef.setInput('content', '**Bold**'); 
    fixture.detectChanges(); 
    const strong = fixture.debugElement.query(By.css('strong')); 
    expect(strong).toBeTruthy(); 
    expect(strong.nativeElement.textContent).toBe('Bold'); 
  }); 

  it('should parse lists', () => { 
    fixture.componentRef.setInput('content', '- Item 1\n- Item 2'); 
    fixture.detectChanges(); 
    const lis = fixture.debugElement.queryAll(By.css('li')); 
    expect(lis.length).toBe(2); 
  }); 
});