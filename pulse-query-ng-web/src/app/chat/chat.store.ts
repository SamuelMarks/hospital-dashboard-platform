/** 
 * @fileoverview Centralized State Management for the Chat Feature. 
 * 
 * Manages: 
 * - Conversation List (History). 
 * - Active Message Stream. 
 * - Loading States (isGenerating). 
 * - Optimistic UI updates. 
 */ 

import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core'; 
import { Subject } from 'rxjs'; 
import { finalize, takeUntil } from 'rxjs/operators'; 
import { HttpErrorResponse } from '@angular/common/http'; 

import { 
  ChatService, 
  ConversationResponse, 
  MessageResponse, 
  MessageCreate, 
  ConversationCreate, 
  MessageVoteRequest, 
  ConversationUpdate
} from '../api-client'; 

export interface ChatState { 
  conversations: ConversationResponse[]; 
  activeConversationId: string | null; 
  messages: MessageResponse[]; 
  isLoadingList: boolean; 
  isGenerating: boolean; 
  error: string | null; 
} 

const initialState: ChatState = { 
  conversations: [], 
  activeConversationId: null, 
  messages: [], 
  isLoadingList: false, 
  isGenerating: false, 
  error: null
}; 

@Injectable({ providedIn: 'root' }) 
export class ChatStore implements OnDestroy { 
  private readonly chatApi = inject(ChatService); 
  private readonly _state = signal<ChatState>(initialState); 
  private readonly destroy$ = new Subject<void>(); 

  readonly state = this._state.asReadonly(); 
  readonly conversations = computed(() => this._state().conversations); 
  readonly activeConversationId = computed(() => this._state().activeConversationId); 
  readonly messages = computed(() => this._state().messages); 
  readonly isDataLoading = computed(() => this._state().isLoadingList); 
  readonly isGenerating = computed(() => this._state().isGenerating); 
  readonly error = computed(() => this._state().error); 

  ngOnDestroy(): void { 
    this.destroy$.next(); 
    this.destroy$.complete(); 
  } 

  loadHistory(): void { 
    this.patch({ isLoadingList: true, error: null }); 
    this.chatApi.listConversationsApiV1ConversationsGet() 
      .pipe(finalize(() => this.patch({ isLoadingList: false })), takeUntil(this.destroy$)) 
      .subscribe({ 
        next: (list: ConversationResponse[]) => this.patch({ conversations: list }), 
        error: (err: any) => this.handleError(err) 
      }); 
  } 

  selectConversation(id: string): void { 
    this.patch({ activeConversationId: id, messages: [], error: null, isLoadingList: true }); 
    this.chatApi.getMessagesApiV1ConversationsConversationIdMessagesGet(id) 
      .pipe(finalize(() => this.patch({ isLoadingList: false })), takeUntil(this.destroy$)) 
      .subscribe({ 
        next: (msgs: MessageResponse[]) => this.patch({ messages: msgs }), 
        error: (err: any) => this.handleError(err) 
      }); 
  } 

  createNewChat(): void { 
    if (!this.activeConversationId() && this.messages().length === 0) return; 
    this.patch({ activeConversationId: null, messages: [], error: null }); 
  } 

  sendMessage(content: string): void { 
    if (!content.trim()) return; 
    const currentId = this.activeConversationId(); 
    this.patch({ isGenerating: true, error: null }); 

    const tempUserMsg: MessageResponse = { 
      id: `temp-${Date.now()}`, 
      conversation_id: currentId || 'temp', 
      role: 'user', 
      content: content, 
      created_at: new Date().toISOString() as any
    }; 
    this.patch({ messages: [...this.messages(), tempUserMsg] }); 

    if (!currentId) { 
      const payload: ConversationCreate = { message: content }; 
      this.chatApi.createConversationApiV1ConversationsPost(payload) 
        .pipe(finalize(() => this.patch({ isGenerating: false }))) 
        .subscribe({ 
          next: (conv: ConversationResponse) => { 
            const updatedList = [conv, ...this.conversations()]; 
            this.patch({ activeConversationId: conv.id, conversations: updatedList, messages: conv.messages || [] }); 
          }, 
          error: (err: any) => { 
            this.patch({ messages: [] }); 
            this.handleError(err); 
          } 
        }); 
    } else { 
      const payload: MessageCreate = { content }; 
      this.chatApi.sendMessageApiV1ConversationsConversationIdMessagesPost(currentId, payload) 
        .pipe(finalize(() => this.patch({ isGenerating: false }))) 
        .subscribe({ 
          next: (aiMsg: MessageResponse) => { 
            this.patch({ messages: [...this.messages(), aiMsg] }); 
          }, 
          error: (err: any) => { 
            const rolledBack = this.messages().filter(m => m.id !== tempUserMsg.id); 
            this.patch({ messages: rolledBack }); 
            this.handleError(err); 
          } 
        }); 
    } 
  } 

  voteCandidate(messageId: string, candidateId: string): void { 
    const activeId = this.activeConversationId(); 
    if (!activeId) return; 

    // Optimistic Logic
    const currentMsgs = this.messages(); 
    const idx = currentMsgs.findIndex(m => m.id === messageId); 
    if (idx === -1) return; 

    const msg = { ...currentMsgs[idx] }; 
    const cand = msg.candidates?.find(c => c.id === candidateId); 
    if (!cand) return; 

    msg.content = cand.content; 
    msg.sql_snippet = cand.sql_snippet; 
    msg.candidates = msg.candidates?.map(c => ({ ...c, is_selected: c.id === candidateId })); 
    
    const newMsgs = [...currentMsgs]; 
    newMsgs[idx] = msg; 
    this.patch({ messages: newMsgs }); 

    this.chatApi.voteMessageApiV1ConversationsConversationIdMessagesMessageIdVotePost(activeId, messageId, { candidate_id: candidateId }) 
      .subscribe({ error: (err) => this.handleError(err) }); 
  } 

  // --- New Methods --- 

  deleteConversation(id: string): void { 
    // Optimistic Remove
    const currentList = this.conversations(); 
    this.patch({ conversations: currentList.filter(c => c.id !== id) }); 

    if (this.activeConversationId() === id) { 
      this.createNewChat(); 
    } 

    this.chatApi.deleteConversationApiV1ConversationsConversationIdDelete(id).subscribe({ 
      error: (err) => { 
        this.patch({ conversations: currentList }); // Rollback
        this.handleError(err); 
      } 
    }); 
  } 

  renameConversation(id: string, newTitle: string): void { 
    const currentList = this.conversations(); 
    const original = currentList.find(c => c.id === id); 
    if (!original) return; 

    this.patch({ conversations: currentList.map(c => c.id === id ? { ...c, title: newTitle } : c) }); 

    this.chatApi.updateConversationApiV1ConversationsConversationIdPut(id, { title: newTitle }).subscribe({ 
      error: (err) => { 
        this.patch({ conversations: currentList }); 
        this.handleError(err); 
      } 
    }); 
  } 

  private patch(p: Partial<ChatState>): void { this._state.update(s => ({ ...s, ...p })); } 
  private handleError(e: unknown): void { 
    const msg = e instanceof HttpErrorResponse ? (e.error?.detail || e.message) : 'Error'; 
    this.patch({ error: msg }); 
  } 
}