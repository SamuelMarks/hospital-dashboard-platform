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

import { DATE_NOW } from '../core/time.token';
import { LoggerService } from '../core/logging/logger.service';
import { createSignalStateContainer } from '../core/state/signal-store.utils';
import { DestroyRef, computed, inject, OnDestroy, Service } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { finalize, takeUntil, retry } from 'rxjs/operators';
import { ChatSseClientService } from './chat-sse-client.service';

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

/** Reactive state shape for the conversational AI assistant store. */
export interface ChatState {
  /** Ordered list of user conversation threads. */
  conversations: ConversationResponse[];
  /** Identifier of the currently selected conversation thread, or null when none is active. */
  activeConversationId: string | null;
  /** Chronological message history for the active conversation. */
  messages: MessageResponse[];
  /** Whether conversation list or thread history is currently loading. */
  isLoadingList: boolean;
  /** Whether an assistant response is currently being generated. */
  isGenerating: boolean;
  /** Latest user-facing error message, or null when healthy. */
  error: string | null;

  /** Available models for selection. */
  availableModels: ModelInfo[];
  /** Currently selected model IDs (if empty, implicit 'all'). */
  selectedModelIds: string[];

  /** Content accumulated during real-time streaming. */
  streamingMessageContent: string | null;
  /** Whether currently consuming real-time token stream. */
  isStreaming: boolean;
}

/** Initial default state snapshot for the conversational AI store. */
const initialState: ChatState = {
  conversations: [],
  activeConversationId: null,
  messages: [],
  isLoadingList: false,
  isGenerating: false,
  error: null,
  availableModels: [],
  selectedModelIds: [],
  streamingMessageContent: null,
  isStreaming: false,
};

/** Centralized reactive state store managing chat conversations, multi-model arena candidates, and SSE streaming. */
@Service()
export class ChatStore implements OnDestroy {
  /** Injected clock provider returning the current Date instance. */
  private readonly dateNow = inject(DATE_NOW);
  /** Angular DestroyRef for declarative RxJS stream teardown. */
  private readonly destroyRef = inject(DestroyRef);
  /** Centralized diagnostic logger service. */
  private readonly logger = inject(LoggerService);
  /** Generated OpenAPI client for conversation and message endpoints. */
  private readonly chatApi = inject(ChatService);
  /** Generated OpenAPI client for AI model discovery endpoints. */
  private readonly aiApi = inject(AiService);
  /** Injectable SSE client service for real-time chat token streaming. */
  private readonly sseClient = inject(ChatSseClientService);
  /** Shared reactive signal state container managing `ChatState` patches and error formatting. */
  private readonly stateContainer = createSignalStateContainer<ChatState>(initialState);
  /** Internal writable signal holding the complete chat store state. */
  private readonly _state = this.stateContainer.writableState;
  /** Subject emitting when the store is destroyed to cancel active subscriptions. */
  private readonly destroy$ = new Subject<void>();

  /** Read-only signal exposing the complete chat store state snapshot. */
  readonly state = this.stateContainer.state;
  /** Computed signal returning the ordered list of user conversation threads. */
  readonly conversations = computed(() => this._state().conversations);
  /** Computed signal returning the currently active conversation UUID, or null if none is selected. */
  readonly activeConversationId = computed(() => this._state().activeConversationId);
  /** Computed signal returning the chronological messages for the active conversation. */
  readonly messages = computed(() => this._state().messages);
  /** Computed signal indicating whether conversation history or messages are loading. */
  readonly isDataLoading = computed(() => this._state().isLoadingList);
  /** Computed signal indicating whether an LLM response generation request is in flight. */
  readonly isGenerating = computed(() => this._state().isGenerating);
  /** Computed signal returning the latest user-facing error message, or null when clear. */
  readonly error = computed(() => this._state().error);

  /** Computed signal returning the list of available LLM models for arena comparison. */
  readonly availableModels = computed(() => this._state().availableModels);
  /** Computed signal returning the list of currently selected model identifiers. */
  readonly selectedModelIds = computed(() => this._state().selectedModelIds);
  /** Computed signal indicating whether an SSE token stream is actively being consumed. */
  readonly isStreaming = computed(() => this._state().isStreaming);
  /** Computed signal returning the accumulated text content of an in-progress SSE stream. */
  readonly streamingMessageContent = computed(() => this._state().streamingMessageContent);

  /** Completes active RxJS streams and aborts any active SSE connection when the store is destroyed. */
  ngOnDestroy(): void {
    this.sseClient.abortActiveStream();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Loads the user's conversation history and available LLM arena models from the backend. */
  loadHistory(): void {
    this.patch({ isLoadingList: true, error: null });
    this.chatApi
      .listConversationsApiV1ConversationsGet()
      .pipe(
        retry(2),
        finalize(() => this.patch({ isLoadingList: false })),
        takeUntil(this.destroy$),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (list: ConversationResponse[]) => this.patch({ conversations: list }),
        error: (err: unknown) => this.handleError(err),
      });

    // Load Models logic
    try {
      if (this.aiApi.listAvailableModelsApiV1AiModelsGet) {
        this.aiApi
          .listAvailableModelsApiV1AiModelsGet()
          .pipe(retry(2), takeUntil(this.destroy$), takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (models: ModelInfo[]) => this.patch({ availableModels: models }),
            error: (err: unknown) => this.logger.error('Failed to load models', err),
          });
      }
    } catch {
      this.logger.warn('AI Models endpoint not available in client');
    }
  }

  /**
   * Selects a conversation and loads its message history.
   *
   * @param id - The conversation ID to select.
   */
  selectConversation(id: string): void {
    this.sseClient.abortActiveStream();
    this.patch({ activeConversationId: id, messages: [], error: null, isLoadingList: true });
    this.chatApi
      .getMessagesApiV1ConversationsConversationIdMessagesGet(id)
      .pipe(
        retry(2),
        finalize(() => this.patch({ isLoadingList: false })),
        takeUntil(this.destroy$),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (msgs: MessageResponse[]) => this.patch({ messages: msgs }),
        error: (err: unknown) => this.handleError(err),
      });
  }

  /** Clears the active conversation selection and message list to begin a fresh chat session. */
  createNewChat(): void {
    this.sseClient.abortActiveStream();
    if (!this.activeConversationId() && this.messages().length === 0) return;
    this.patch({ activeConversationId: null, messages: [], error: null });
  }

  /**
   * Toggles a model ID in the selected models list for arena generation.
   *
   * @param modelId - The model identifier to toggle.
   */
  toggleModelSelection(modelId: string): void {
    const current = this.selectedModelIds();
    if (current.includes(modelId)) {
      this.patch({ selectedModelIds: current.filter((id) => id !== modelId) });
    } else {
      this.patch({ selectedModelIds: [...current, modelId] });
    }
  }

  /**
   * Sends a user message to the active conversation or creates a new conversation.
   *
   * @param content - The message text to send.
   */
  sendMessage(content: string): void {
    if (!content.trim()) return;
    const currentId = this.activeConversationId();
    this.patch({ isGenerating: true, error: null });

    const tempUserMsg: MessageResponse = {
      id: `temp-${this.dateNow().getTime()}`,
      conversation_id: currentId || 'temp',
      role: 'user',
      content: content,
      created_at: this.dateNow().toISOString(),
      candidates: [],
    };
    this.patch({ messages: [...this.messages(), tempUserMsg] });

    const targetModels = this.selectedModelIds().length > 0 ? this.selectedModelIds() : null;

    if (!currentId) {
      // Create new
      const payload: ConversationCreate = { message: content, target_models: targetModels };
      this.chatApi
        .createConversationApiV1ConversationsPost(payload)
        .pipe(
          retry(2),
          finalize(() => this.patch({ isGenerating: false })),
        )
        .subscribe({
          next: (convResponse: ConversationDetail | ConversationResponse) => {
            const updatedList = [convResponse, ...this.conversations()];
            const messages =
              'messages' in convResponse && Array.isArray(convResponse.messages)
                ? convResponse.messages
                : [];

            this.patch({
              activeConversationId: convResponse.id,
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
   * Streams LLM generation for a conversation using SSE / readable stream.
   *
   * @param conversationId The target conversation ID.
   * @param modelId Optional target model ID.
   * @returns Promise resolving when streaming is complete.
   */
  async streamResponse(conversationId: string, modelId?: string): Promise<void> {
    this.patch({ isStreaming: true, streamingMessageContent: '', error: null });
    try {
      await this.sseClient.consumeStream(
        conversationId,
        (data) => {
          if (data.event === 'token') {
            const current = this._state().streamingMessageContent || '';
            this.patch({ streamingMessageContent: current + data.token });
            return false;
          }
          const finalMsg: MessageResponse = {
            id: data.message_id || `msg-${this.dateNow().getTime()}`,
            conversation_id: conversationId,
            role: 'assistant',
            content: data.content || this._state().streamingMessageContent || '',
            sql_snippet: data.sql_snippet || null,
            created_at: this.dateNow().toISOString(),
            candidates: [],
          };
          this.patch({
            messages: [...this.messages(), finalMsg],
            streamingMessageContent: null,
            isStreaming: false,
          });
          return true;
        },
        modelId,
      );
      this.patch({ isStreaming: false });
    } catch (err: unknown) {
      this.patch({ isStreaming: false, streamingMessageContent: null });
      this.handleError(err);
    }
  }

  /**
   * Votes for a specific model candidate response within a message.
   *
   * @param messageId - The ID of the assistant message containing candidates.
   * @param candidateId - The ID of the chosen candidate response.
   */
  voteCandidate(messageId: string, candidateId: string): void {
    const activeId = this.activeConversationId();
    if (!activeId) return;

    // Optimistic Logic
    const currentMsgs = this.messages();
    const idx = currentMsgs.findIndex((m) => m.id === messageId);
    const targetMsg = currentMsgs[idx];
    if (!targetMsg) return;

    const msg: MessageResponse = { ...targetMsg };
    const candidates = msg.candidates ?? [];
    const cand = candidates.find((c) => c.id === candidateId);
    if (!cand) return;

    msg.content = cand.content || '';
    msg.sql_snippet = cand.sql_snippet || null;
    const selectedHash = cand.sql_hash;

    msg.candidates = candidates.map((c) => ({
      ...c,
      is_selected: selectedHash ? c.sql_hash === selectedHash : c.id === candidateId,
    }));

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

  /**
   * Deletes a conversation by ID with optimistic state update and error rollback.
   *
   * @param id - The ID of the conversation to delete.
   */
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

  /**
   * Renames an existing conversation by ID.
   *
   * @param id - The ID of the conversation to rename.
   * @param newTitle - The new title to assign to the conversation.
   */
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

  /**
   * Patches the internal chat store state with partial updates.
   *
   * @param p - Partial state properties to merge into the current state.
   */
  patch(p: Partial<ChatState>): void {
    this.stateContainer.patch(p);
  }

  /**
   * Handles API errors by logging and updating the error state signal.
   *
   * @param e - The caught error object or HTTP error response.
   */
  handleError(e: unknown): void {
    this.logger.error('[ChatStore] API Error:', e);
    this.stateContainer.patchError(e, $localize`Error`);
  }
}
