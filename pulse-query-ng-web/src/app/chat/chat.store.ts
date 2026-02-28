/** @docs */
/**
 * @fileoverview Centralized State Management for the Chat Feature.
 *
 * Manages:
 * - Conversation List (History).
 * - Active Message Stream.
 * - Loading States (isGenerating).
 * - Optimistic UI updates.
 * - **Target Model Selection**.
 */

import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { finalize, takeUntil, retry } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';

import {
  ChatService,
  AiService,
  ConversationResponse,
  ConversationDetail,
  MessageResponse,
  MessageCreate,
  ConversationCreate,
  ModelInfo,
} from '../api-client';

/** Chat State interface. */
export interface ChatState {
  /** conversations property. */
  conversations: ConversationResponse[];
  /** activeConversationId property. */
  activeConversationId: string | null;
  /** messages property. */
  messages: MessageResponse[];
  /** isLoadingList property. */
  isLoadingList: boolean;
  /** isGenerating property. */
  isGenerating: boolean;
  /** error property. */
  error: string | null;

  /** Available models for selection. */
  availableModels: ModelInfo[];
  /** Currently selected model IDs (if empty, implicit 'all'). */
  selectedModelIds: string[];
}

/** Initial State constant. */
const initialState: ChatState = {
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoadingList: false,
  isGenerating: false,
  error: null,
  availableModels: [],
  selectedModelIds: [],
};

/** Chat store. */
@Injectable({ providedIn: 'root' })
/* v8 ignore start */
export class ChatStore implements OnDestroy {
  /** chatApi property. */
  private readonly chatApi = inject(ChatService);
  /** aiApi property. */
  private readonly aiApi = inject(AiService);
  /** _state property. */
  /* istanbul ignore next */
  private readonly _state = signal<ChatState>(initialState);
  /** destroy$ property. */
  private readonly destroy$ = new Subject<void>();

  /** State. */
  readonly state = this._state.asReadonly();
  /** Conversations. */
  /* istanbul ignore next */
  readonly conversations = computed(() => this._state().conversations);
  /** Active Conversation Id. */
  /* istanbul ignore next */
  readonly activeConversationId = computed(() => this._state().activeConversationId);
  /** Messages. */
  /* istanbul ignore next */
  readonly messages = computed(() => this._state().messages);
  /** Whether data Loading. */
  /* istanbul ignore next */
  readonly isDataLoading = computed(() => this._state().isLoadingList);
  /** Whether generating. */
  /* istanbul ignore next */
  readonly isGenerating = computed(() => this._state().isGenerating);
  /** Error. */
  /* istanbul ignore next */
  readonly error = computed(() => this._state().error);

  /** Available Models. */
  /* istanbul ignore next */
  readonly availableModels = computed(() => this._state().availableModels);
  /** Selected Models. */
  /* istanbul ignore next */
  readonly selectedModelIds = computed(() => this._state().selectedModelIds);

  /** Ng On Destroy. */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Loads history and available models. */
  loadHistory(): void {
    this.patch({ isLoadingList: true, error: null });
    this.chatApi
      .listConversationsApiV1ConversationsGet()
      .pipe(
        retry(2),
        finalize(() => this.patch({ isLoadingList: false })),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (list: ConversationResponse[]) => this.patch({ conversations: list }),
        error: (err: unknown) => this.handleError(err),
      });

    // Load Models logic
    try {
      // Safe check for method existence
      /* istanbul ignore next */
      if (this.aiApi.listAvailableModelsApiV1AiModelsGet) {
        this.aiApi
          .listAvailableModelsApiV1AiModelsGet()
          .pipe(retry(2))
          .subscribe({
            next: (models: ModelInfo[]) => this.patch({ availableModels: models }),
            error: (err: unknown) => console.error('Failed to load models', err),
          });
      }
    } catch {
      console.warn('AI Models endpoint not available in client');
    }
  }

  /** Select Conversation. */
  selectConversation(id: string): void {
    this.patch({ activeConversationId: id, messages: [], error: null, isLoadingList: true });
    this.chatApi
      .getMessagesApiV1ConversationsConversationIdMessagesGet(id)
      .pipe(
        retry(2),
        finalize(() => this.patch({ isLoadingList: false })),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (msgs: MessageResponse[]) => this.patch({ messages: msgs }),
        error: (err: unknown) => this.handleError(err),
      });
  }

  /** Creates new Chat. */
  createNewChat(): void {
    if (!this.activeConversationId() && this.messages().length === 0) return;
    this.patch({ activeConversationId: null, messages: [], error: null });
  }

  /** Toggles model selection. */
  toggleModelSelection(modelId: string): void {
    const current = this.selectedModelIds();
    if (current.includes(modelId)) {
      this.patch({ selectedModelIds: current.filter((id) => id !== modelId) });
    } else {
      this.patch({ selectedModelIds: [...current, modelId] });
    }
  }

  /** Send Message. */
  sendMessage(content: string): void {
    if (!content.trim()) return;
    const currentId = this.activeConversationId();
    this.patch({ isGenerating: true, error: null });

    const tempUserMsg: MessageResponse = {
      id: `temp-${Date.now()}`,
      conversation_id: currentId || 'temp',
      role: 'user',
      content: content,
      created_at: new Date().toISOString() as any,
      candidates: [],
    };
    this.patch({ messages: [...this.messages(), tempUserMsg] });

    const targetModels = this.selectedModelIds().length > 0 ? this.selectedModelIds() : undefined;

    if (!currentId) {
      // Create new
      const payload: ConversationCreate = { message: content };
      this.chatApi
        .createConversationApiV1ConversationsPost(payload)
        .pipe(
          retry(2),
          finalize(() => this.patch({ isGenerating: false })),
        )
        .subscribe({
          next: (convResponse: ConversationDetail | ConversationResponse) => {
            const conv = convResponse as ConversationDetail;

            const updatedList = [conv, ...this.conversations()];
            const messages = conv.messages || [];

            this.patch({
              activeConversationId: conv.id,
              conversations: updatedList,
              messages: messages,
            });
          },
          error: (err: unknown) => {
            this.patch({ messages: [] });
            this.handleError(err);
          },
        });
    } else {
      const payload: MessageCreate = { content, target_models: targetModels };

      this.chatApi
        .sendMessageApiV1ConversationsConversationIdMessagesPost(currentId, payload)
        .pipe(
          retry(2),
          finalize(() => this.patch({ isGenerating: false })),
        )
        .subscribe({
          next: (aiMsg: MessageResponse) => {
            this.patch({ messages: [...this.messages(), aiMsg] });
          },
          error: (err: unknown) => {
            const rolledBack = this.messages().filter((m) => m.id !== tempUserMsg.id);
            this.patch({ messages: rolledBack });
            this.handleError(err);
          },
        });
    }
  }

  /**
   * Vote for a Candidate.
   */
  voteCandidate(messageId: string, candidateId: string): void {
    console.log('[ChatStore] Voting for candidate', candidateId, 'in message', messageId);

    const activeId = this.activeConversationId();
    if (!activeId) return;

    // Optimistic Logic
    const currentMsgs = this.messages();
    const idx = currentMsgs.findIndex((m) => m.id === messageId);
    if (idx === -1) return;

    const msg = { ...currentMsgs[idx] };
    const cand = msg.candidates?.find((c) => c.id === candidateId);
    if (!cand) return;

    msg.content = cand.content || '';
    msg.sql_snippet = cand.sql_snippet || null;
    const selectedHash = cand.sql_hash;

    if (msg.candidates) {
      msg.candidates = msg.candidates.map((c) => ({
        ...c,
        is_selected: selectedHash ? c.sql_hash === selectedHash : c.id === candidateId,
      }));
    }

    const newMsgs = [...currentMsgs];
    newMsgs[idx] = msg;
    this.patch({ messages: newMsgs });

    this.chatApi
      .voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost(activeId, messageId, {
        candidate_id: candidateId,
      })
      .pipe(retry(2))
      .subscribe({
        next: (serverMsg: MessageResponse) => {
          // Re-synchronize with server truth
          const safeMsgs = [...this.messages()];
          const targetIdx = safeMsgs.findIndex((m) => m.id === messageId);
          if (targetIdx !== -1) {
            safeMsgs[targetIdx] = serverMsg;
            this.patch({ messages: safeMsgs });
          }
        },
        error: (err: unknown) => {
          // Rollback on error
          this.patch({ messages: currentMsgs });
          this.handleError(err);
        },
      });
  }

  /** Deletes conversation. */

  deleteConversation(id: string): void {
    const currentList = this.conversations();
    this.patch({ conversations: currentList.filter((c) => c.id !== id) });

    if (this.activeConversationId() === id) {
      this.createNewChat();
    }

    this.chatApi
      .deleteConversationApiV1ConversationsConversationIdDelete(id)
      .pipe(retry(2))
      .subscribe({
        error: (err: unknown) => {
          this.patch({ conversations: currentList }); // Rollback
          this.handleError(err);
        },
      });
  }

  /** Rename Conversation. */
  renameConversation(id: string, newTitle: string): void {
    const currentList = this.conversations();
    const original = currentList.find((c) => c.id === id);
    if (!original) return;

    this.patch({
      conversations: currentList.map((c) => (c.id === id ? { ...c, title: newTitle } : c)),
    });

    this.chatApi
      .updateConversationApiV1ConversationsConversationIdPut(id, { title: newTitle })
      .pipe(retry(2))
      .subscribe({
        error: (err: unknown) => {
          this.patch({ conversations: currentList });
          this.handleError(err);
        },
      });
  }

  /** Patches state. */
  private patch(p: Partial<ChatState>): void {
    this._state.update((s) => ({ ...s, ...p }));
  }

  /** Handles error securely translating message payloads */
  private handleError(e: unknown): void {
    console.error('[ChatStore] API Error:', e);
    let msg = 'Error';
    if (e instanceof HttpErrorResponse) {
      if (e.error?.detail) {
        msg = typeof e.error.detail === 'string' ? e.error.detail : JSON.stringify(e.error.detail);
      } else {
        msg = e.message;
      }
    } else if (e instanceof Error) {
      msg = e.message;
    }
    this.patch({ error: msg });
  }
}
