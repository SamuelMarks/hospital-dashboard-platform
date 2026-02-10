import { 
  Component, 
  inject, 
  ChangeDetectionStrategy, 
  ViewChild, 
  ElementRef, 
  AfterViewChecked, 
  effect
} from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { FormsModule } from '@angular/forms'; 

// Material
import { MatButtonModule } from '@angular/material/button'; 
import { MatIconModule } from '@angular/material/icon'; 
import { MatInputModule } from '@angular/material/input'; 
import { MatFormFieldModule } from '@angular/material/form-field'; 
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'; 
import { MatCardModule } from '@angular/material/card'; 

// Core
import { ChatStore } from '../chat.store'; 
import { AskDataService } from '../../global/ask-data.service'; 
import { VizMarkdownComponent } from '../../shared/visualizations/viz-markdown/viz-markdown.component'; 
import { SqlSnippetComponent } from './sql-snippet.component'; 
import { MessageResponse } from '../../api-client'; 

@Component({ 
  selector: 'app-conversation', 
  imports: [ 
    CommonModule, 
    FormsModule, 
    MatButtonModule, 
    MatIconModule, 
    MatInputModule, 
    MatFormFieldModule, 
    MatProgressSpinnerModule, 
    MatCardModule, 
    VizMarkdownComponent, 
    SqlSnippetComponent
  ], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; background-color: var(--sys-background); } 
    .message-list { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; } 
    .bubble-row { display: flex; width: 100%; } 
    .bubble-row.user { justify-content: flex-end; } 
    .bubble-row.assistant { justify-content: flex-start; } 
    .bubble { max-width: 90%; padding: 12px 16px; border-radius: 12px; font-size: 14px; line-height: 1.5; position: relative; } 
    .user .bubble { background-color: var(--sys-primary); color: white; border-bottom-right-radius: 2px; } 
    .assistant .bubble { background-color: var(--sys-surface); color: var(--sys-text-primary); border: 1px solid var(--sys-surface-border); border-bottom-left-radius: 2px; } 
    .input-area { padding: 16px; background-color: var(--sys-surface); border-top: 1px solid var(--sys-surface-border); display: flex; gap: 8px; align-items: flex-end; } 
    .timestamp { font-size: 10px; opacity: 0.7; margin-top: 4px; text-align: right; display: block; } 
    
    /* Comparison Grid */ 
    .arena-grid { 
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; 
      min-width: 250px; margin-top: 8px; 
    } 
    .candidate-card { 
      border: 1px solid var(--sys-surface-border); background: #fafafa; border-radius: 8px; 
      padding: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 13px; 
    } 
    .candidate-header { font-weight: bold; font-size: 11px; text-transform: uppercase; color: #666; border-bottom: 1px solid #eee; padding-bottom: 4px; } 
    .candidate-preview { flex: 1; max-height: 200px; overflow: auto; font-family: monospace; font-size: 11px; background: #fff; padding: 4px; border: 1px solid #eee; white-space: pre-wrap; word-break: break-word; } 
  `], 
  template: `
    <div class="message-list" #scrollContainer>
      
      @if (store.messages().length === 0 && !store.isGenerating()) { 
        <div class="flex flex-col items-center justify-center h-full text-gray-400 select-none">
          <mat-icon class="text-6xl mb-4 text-gray-300">forum</mat-icon>
          <p>Start a new analysis conversation.</p>
        </div>
      } 

      @for (msg of store.messages(); track msg.id) { 
        <div class="bubble-row" [ngClass]="msg.role">
          <div class="bubble mat-elevation-z1" [style.max-width.%]="hasPendingCandidates(msg) ? 100 : 80">
            
            <!-- A: Pending Vote (Compare 3 Options) -->
            @if (hasPendingCandidates(msg)) { 
               <div class="mb-2 font-medium">Please vote for the best response ({{ msg.candidates?.length }} Options):</div>
               
               <div class="arena-grid"> 
                 @for (cand of msg.candidates; track cand.id) { 
                   <div class="candidate-card mat-elevation-z1">
                     <div class="candidate-header">{{ cand.model_name }}</div>
                     
                     <div class="flex-grow">
                        <!-- If short content, markdown. If mostly SQL, check snippet. -->
                        <viz-markdown [content]="cleanContentSimple(cand.content)"></viz-markdown>
                        @if (cand.sql_snippet) { <div class="candidate-preview mt-2">{{ cand.sql_snippet }}</div> } 
                     </div>

                     <button mat-stroked-button color="primary" class="mt-2 w-full" (click)="vote(msg.id, cand.id)">
                       Vote & Select [{{ cand.model_name }}] 
                     </button>
                   </div>
                 } 
               </div>

            <!-- B: Standard Resolved View -->
            } @else { 
               <viz-markdown [content]="cleanContent(msg)"></viz-markdown>
               @if (msg.sql_snippet) { 
                 <app-sql-snippet [sql]="msg.sql_snippet" (run)="runQuery($event)"></app-sql-snippet>
               } 
            } 

            <span class="timestamp">{{ msg.created_at | date:'shortTime' }}</span>
          </div>
        </div>
      } 

      @if (store.isGenerating()) { 
        <div class="bubble-row assistant">
          <div class="bubble" style="padding: 8px 16px;">
            <div class="flex gap-1">
              <span class="animate-bounce">.</span>
              <span class="animate-bounce delay-100">.</span>
              <span class="animate-bounce delay-200">.</span>
            </div>
          </div>
        </div>
      } 

      @if (store.error(); as err) { 
        <div class="w-full text-center p-2 mb-2 bg-red-50 text-red-600 text-xs rounded border border-red-200">{{ err }}</div>
      } 
    </div>

    <!-- Input Footer -->
    <div class="input-area">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="flex-grow">
        <textarea matInput placeholder="Ask question..." [(ngModel)]="inputText" (keydown.enter)="handleEnter($event)" rows="1" cdkTextareaAutosize [disabled]="store.isGenerating()"></textarea>
      </mat-form-field>
      
      <!-- A11y Fix: Added label for E2E tests -->
      <button 
        mat-icon-button 
        color="primary" 
        class="h-12 w-12" 
        (click)="send()" 
        [disabled]="!inputText.trim() || store.isGenerating()"
        aria-label="Send Message"
      >
        <mat-icon>send</mat-icon>
      </button>
    </div>
  `
}) 
export class ConversationComponent implements AfterViewChecked { 
  public readonly store = inject(ChatStore); 
  private readonly scratchpadService = inject(AskDataService); 

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef; 
  inputText = ''; 

  constructor() { 
    effect(() => { 
      const len = this.store.messages().length; 
      if (len > 0) this.scrollToBottom(); 
    }); 
  } 

  ngAfterViewChecked() { } 

  handleEnter(e: Event): void { 
    const event = e as KeyboardEvent; 
    if (event.shiftKey) return; 
    event.preventDefault(); 
    this.send(); 
  } 

  send(): void { 
    if (!this.inputText.trim()) return; 
    this.store.sendMessage(this.inputText); 
    this.inputText = ''; 
  } 

  cleanContent(msg: MessageResponse): string { 
    if (!msg.sql_snippet) return msg.content; 
    // Remove code blocks
    return msg.content.replace(/```sql[\s\S]*?```/gi, '').trim(); 
  } 

  cleanContentSimple(txt: string): string { 
    return txt.replace(/```sql[\s\S]*?```/gi, '').trim(); 
  } 

  runQuery(sql: string): void { 
    this.scratchpadService.open(); 
  } 

  hasPendingCandidates(msg: MessageResponse): boolean { 
    if (msg.role !== 'assistant' || !msg.candidates || msg.candidates.length === 0) return false; 
    return !msg.candidates.some(c => c.is_selected); 
  } 

  vote(msgId: string, candId: string): void { 
    this.store.voteCandidate(msgId, candId); 
  } 

  private scrollToBottom(): void { 
    const container = this.scrollContainer?.nativeElement; 
    if (!container) return; 
    setTimeout(() => { 
      const el = this.scrollContainer?.nativeElement; 
      if (!el) return; 
      el.scrollTop = el.scrollHeight; 
    }, 50); 
  } 
} 
