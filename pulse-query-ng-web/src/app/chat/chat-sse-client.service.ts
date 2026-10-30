/**
 * @fileoverview Injectable Server-Sent Events (SSE) client service for real-time chat token streaming.
 *
 * Encapsulates `fetch`, bearer token header attachment, and line-buffered SSE JSON frame parsing
 * so `ChatStore` remains focused on reactive state management.
 */

import { Service } from '@angular/core';
import { safeStorage } from '../core/storage.utils';

/**
 * Discriminated union of parsed Server-Sent Events emitted during chat token streaming.
 */
export type ChatStreamEvent =
  | {
      /** Incremental token delta event type. */
      readonly event: 'token';
      /** Incremental text token string. */
      readonly token: string;
    }
  | {
      /** Stream completion event type. */
      readonly event: 'done';
      /** Optional persisted assistant message UUID. */
      readonly message_id?: string;
      /** Optional complete assistant response text. */
      readonly content?: string;
      /** Optional extracted SQL snippet. */
      readonly sql_snippet?: string | null;
    };

/**
 * Parses a raw `data: {...}` SSE line into a strongly typed `ChatStreamEvent | null`.
 *
 * @param line - Trimmed SSE line starting with `data:`.
 * @returns Parsed `ChatStreamEvent` or `null` if the line is non-matching or partial JSON.
 */
export function parseChatSseDataLine(line: string): ChatStreamEvent | null {
  try {
    const raw: unknown = JSON.parse(line.substring(5).trim());
    if (typeof raw !== 'object' || raw === null || !('event' in raw)) {
      return null;
    }
    if (raw.event === 'token' && 'token' in raw && typeof raw.token === 'string') {
      return { event: 'token', token: raw.token };
    }
    if (raw.event === 'done') {
      const messageId =
        'message_id' in raw && typeof raw.message_id === 'string' ? raw.message_id : undefined;
      const content = 'content' in raw && typeof raw.content === 'string' ? raw.content : undefined;
      const sqlSnippet =
        'sql_snippet' in raw && (typeof raw.sql_snippet === 'string' || raw.sql_snippet === null)
          ? raw.sql_snippet
          : undefined;
      return {
        event: 'done',
        ...(messageId !== undefined ? { message_id: messageId } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(sqlSnippet !== undefined ? { sql_snippet: sqlSnippet } : {}),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Injectable service that consumes the `/api/v1/chat/stream/{conversationId}` SSE endpoint.
 */
@Service()
export class ChatSseClientService {
  /** Currently active `AbortController` for cancelling an in-flight SSE stream. */
  private activeAbortController: AbortController | null = null;

  /**
   * Aborts any currently active SSE stream request.
   */
  abortActiveStream(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
  }

  /**
   * Connects to the chat SSE endpoint and invokes `onEvent` for each parsed `ChatStreamEvent`.
   *
   * @param conversationId - Target conversation UUID.
   * @param onEvent - Callback invoked for each parsed `token` or `done` event; returns `true` to stop early.
   * @param modelId - Optional specific LLM model identifier to target.
   * @returns Promise resolving when the stream finishes or `onEvent` signals completion.
   */
  async consumeStream(
    conversationId: string,
    onEvent: (evt: ChatStreamEvent) => boolean,
    modelId?: string,
  ): Promise<void> {
    this.abortActiveStream();
    const controller = new AbortController();
    this.activeAbortController = controller;

    const url = `/api/v1/chat/stream/${conversationId}${modelId ? `?model_id=${encodeURIComponent(modelId)}` : ''}`;
    const token = safeStorage.getItem('pulse_auth_token');
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Streaming failed with status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Readable stream not supported');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(String.fromCharCode(10));
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const parsed = parseChatSseDataLine(trimmed);
            if (parsed && onEvent(parsed)) {
              return;
            }
          }
        }
      }
    } finally {
      if (this.activeAbortController === controller) {
        this.activeAbortController = null;
      }
    }
  }
}
