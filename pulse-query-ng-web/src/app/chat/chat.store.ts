/**
 * @fileoverview Centralized State Management for the Chat Feature.
 *
 * Manages:
 * - Conversation List (History).
 * - Active Message Stream.
 * - Loading States (isGenerating).
 * - Optimistic UI updates for immediate feedback.
 */

import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { switchMap, tap, finalize, takeUntil } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';

// Using API Client types generated in client-shim layer (or assumed existing)
import {
  ChatService,
  ConversationResponse,
  MessageResponse,
  MessageCreate,
  ConversationCreate
} from '../api-client';

/**
 * Normalized State Interface for Chat.
 */
export interface ChatState {
  /** List of historical conversation metadata. */
  conversations: ConversationResponse[];
  /** The UUID of the currently selected conversation. */
  activeConversationId: string | null;
  /** The message history of the active conversation. */
  messages: MessageResponse[];
  /** Global loading state for sidebar/list operations. */
  isLoadingList: boolean;
  /** Loading state for message generation (typing indicator). */
  isGenerating: boolean;
  /** Last error message encountered. */
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

  // Selectors
  readonly state = this._state.asReadonly();
  readonly conversations = computed(() => this._state().conversations);
  readonly activeConversationId = computed(() => this._state().activeConversationId);
  readonly messages = computed(() => this._state().messages);
  readonly isDataLoading = computed(() => this._state().isLoadingList);
  readonly isGenerating = computed(() => this._state().isGenerating);
  readonly error = computed(() => this._state().error);

  /**
   * Computed: Returns the active Conversation object metadata.
   */
  readonly activeConversation = computed(() =>
    this._state().conversations.find(c => c.id === this._state().activeConversationId) || null
  );

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Fetches the list of user conversations from the backend.
   */
  loadHistory(): void {
    this.patch({ isLoadingList: true, error: null });
    this.chatApi.listConversationsApiV1ConversationsGet()
      .pipe(
        finalize(() => this.patch({ isLoadingList: false })),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (list: ConversationResponse[]) => this.patch({ conversations: list }),
        error: (err: any) => this.handleError(err)
      });
  }

  /**
   * Selects a conversation and loads its messages.
   *
   * @param {string} id - The Conversation UUID.
   */
  selectConversation(id: string): void {
    // Optimistic switch
    this.patch({ activeConversationId: id, messages: [], error: null, isLoadingList: true });

    this.chatApi.getMessagesApiV1ConversationsConversationIdMessagesGet(id)
      .pipe(
        finalize(() => this.patch({ isLoadingList: false })),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (msgs: MessageResponse[]) => this.patch({ messages: msgs }),
        error: (err: any) => this.handleError(err)
      });
  }

  /**
   * Creates a new blank conversation session.
   * Effectively resets the active view to allow a fresh start.
   */
  createNewChat(): void {
    // If we're already on a new empty chat (no messages, no ID), do nothing
    if (!this.activeConversationId() && this.messages().length === 0) return;

    // Reset Active ID to null indicates "Draft Mode"
    this.patch({ activeConversationId: null, messages: [], error: null });
  }

  /**
   * Sends a user message.
   *
   * Logic:
   * 1. If NO conversation is active, Create Conversation FIRST.
   * 2. If Conversation active, Post Message.
   * 3. Optimistic UI update (show user message immediately).
   * 4. Updates State with Assistant response.
   *
   * @param {string} content - The user text input.
   */
  sendMessage(content: string): void {
    if (!content.trim()) return;

    const currentId = this.activeConversationId();
    this.patch({ isGenerating: true, error: null });

    // Optimistic Append (Temporary ID)
    const tempUserMsg: MessageResponse = {
      id: `temp-${Date.now()}`,
      conversation_id: currentId || 'temp',
      role: 'user',
      content: content,
      created_at: new Date().toISOString() as any
    };

    // Update UI immediately
    this.patch({ messages: [...this.messages(), tempUserMsg] });

    if (!currentId) {
      // Branch A: Create New Conversation
      const payload: ConversationCreate = { message: content };
      this.chatApi.createConversationApiV1ConversationsPost(payload)
        .pipe(
          finalize(() => this.patch({ isGenerating: false }))
        )
        .subscribe({
          next: (conv: ConversationResponse) => {
            // Update Full State: New Conversation ID, Full Message History (User + AI)
            const updatedList = [conv, ...this.conversations()];
            this.patch({
              activeConversationId: conv.id,
              conversations: updatedList,
              messages: conv.messages || [] // Backend returns [User, Assistant]
            });
          },
          error: (err: any) => {
            // Rollback optimistic message on failure
            this.patch({ messages: [] });
            this.handleError(err);
          }
        });

    } else {
      // Branch B: Append to Existing
      const payload: MessageCreate = { content };
      this.chatApi.sendMessageApiV1ConversationsConversationIdMessagesPost(currentId, payload)
        .pipe(
          finalize(() => this.patch({ isGenerating: false }))
        )
        .subscribe({
          next: (aiMsg: MessageResponse) => {
            // Replace Temp User Message with Real one?
            // Actually, we just append the AI message. The user message is persisted on backend.
            this.patch({ messages: [...this.messages(), aiMsg] });
          },
          error: (err: any) => {
            // Simple rollback for MVP
            const rolledBack = this.messages().filter(m => m.id !== tempUserMsg.id);
            this.patch({ messages: rolledBack });
            this.handleError(err);
          }
        });
    }
  }

  /**
   * Internal helper to update state immutably.
   */
  private patch(partial: Partial<ChatState>): void {
    this._state.update(state => ({ ...state, ...partial }));
  }

  /**
   * Errors handling routine.
   */
  private handleError(err: unknown): void {
    let msg = 'An unexpected error occurred';
    if (err instanceof HttpErrorResponse) {
      msg = err.error?.detail || err.message;
    }
    this.patch({ error: msg });
  }
}