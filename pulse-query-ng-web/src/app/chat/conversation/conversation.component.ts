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

/** Conversation component. */
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
    templateUrl: './conversation.component.html'
}) 
export class ConversationComponent implements AfterViewChecked { 
  /** Store. */
  public readonly store = inject(ChatStore); 
    /** scratchpadService property. */
private readonly scratchpadService = inject(AskDataService); 

    /** scrollContainer property. */
@ViewChild('scrollContainer') private scrollContainer!: ElementRef; 
  /** Input Text. */
  inputText = ''; 

  /** Creates a new ConversationComponent. */
  constructor() { 
    effect(() => { 
      const len = this.store.messages().length; 
      if (len > 0) this.scrollToBottom(); 
    }); 
  } 

  /** Ng After View Checked. */
  ngAfterViewChecked() { } 

  /** Handles enter. */
  handleEnter(e: Event): void { 
    const event = e as KeyboardEvent; 
    if (event.shiftKey) return; 
    event.preventDefault(); 
    this.send(); 
  } 

  /** Send. */
  send(): void { 
    if (!this.inputText.trim()) return; 
    this.store.sendMessage(this.inputText); 
    this.inputText = ''; 
  } 

  /** Clean Content. */
  cleanContent(msg: MessageResponse): string { 
    if (!msg.sql_snippet) return msg.content; 
    // Remove code blocks
    return msg.content.replace(/```sql[\s\S]*?```/gi, '').trim(); 
  } 

  /** Clean Content Simple. */
  cleanContentSimple(txt: string): string { 
    return txt.replace(/```sql[\s\S]*?```/gi, '').trim(); 
  } 

  /** Run Query. */
  runQuery(sql: string): void { 
    this.scratchpadService.open(); 
  } 

  /** Whether pending Candidates. */
  hasPendingCandidates(msg: MessageResponse): boolean { 
    if (msg.role !== 'assistant' || !msg.candidates || msg.candidates.length === 0) return false; 
    return !msg.candidates.some(c => c.is_selected); 
  } 

  /** Vote. */
  vote(msgId: string, candId: string): void { 
    this.store.voteCandidate(msgId, candId); 
  } 

    /** scrollToBottom method. */
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
