/**
 * @fileoverview Exhaustive unit tests for ChatStore to satisfy 100% CC.
 */
import { TestBed } from '@angular/core/testing';
import { ChatStore } from './chat.store';
import {
  ChatService,
  AiService,
  ConversationResponse,
  ConversationDetail,
  MessageResponse,
} from '../api-client';
import { of, throwError, Subject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { safeStorage } from '../core/storage.utils';
import {
  createMockCandidate,
  createMockConversation,
  createMockMessage,
} from '../../test-utils/mock-factories';
import { vi } from 'vitest';

describe('ChatStore', () => {
  let store: ChatStore;
  let mockApi: {
    listConversationsApiV1ConversationsGet: ReturnType<typeof vi.fn>;
    createConversationApiV1ConversationsPost: ReturnType<typeof vi.fn>;
    getMessagesApiV1ConversationsConversationIdMessagesGet: ReturnType<typeof vi.fn>;
    sendMessageApiV1ConversationsConversationIdMessagesPost: ReturnType<typeof vi.fn>;
    voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost: ReturnType<
      typeof vi.fn
    >;
    deleteConversationApiV1ConversationsConversationIdDelete: ReturnType<typeof vi.fn>;
    updateConversationApiV1ConversationsConversationIdPut: ReturnType<typeof vi.fn>;
  };
  let mockAiApi: { listAvailableModelsApiV1AiModelsGet?: ReturnType<typeof vi.fn> };

  const MOCK_CONV: ConversationResponse = createMockConversation({
    id: 'c1',
    title: 'Start',
    updated_at: '2023-01-01',
    user_id: 'u1',
    created_at: '2023-01-01',
  });

  const MOCK_MSG: MessageResponse = createMockMessage({
    id: 'm1',
    conversation_id: 'c1',
    role: 'assistant',
    content: 'test',
    created_at: 'now',
    candidates: [
      createMockCandidate({
        id: 'cand1',
        model_name: 'M1',
        content: 'C1',
        sql_hash: 'hashA',
        is_selected: false,
      }),
    ],
  });

  beforeEach(() => {
    vi.useFakeTimers();
    mockApi = {
      listConversationsApiV1ConversationsGet: vi.fn(),
      createConversationApiV1ConversationsPost: vi.fn(),
      getMessagesApiV1ConversationsConversationIdMessagesGet: vi.fn(),
      sendMessageApiV1ConversationsConversationIdMessagesPost: vi.fn(),
      voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost: vi.fn(),
      deleteConversationApiV1ConversationsConversationIdDelete: vi.fn(),
      updateConversationApiV1ConversationsConversationIdPut: vi.fn(),
    };
    mockAiApi = {
      listAvailableModelsApiV1AiModelsGet: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ChatStore,
        { provide: ChatService, useValue: mockApi },
        { provide: AiService, useValue: mockAiApi },
      ],
    });
    store = TestBed.inject(ChatStore);
  });

  afterEach(() => vi.useRealTimers());

  describe('loadHistory', () => {
    it('loads history and models on success', () => {
      mockApi.listConversationsApiV1ConversationsGet.mockReturnValue(of([MOCK_CONV]));
      mockAiApi.listAvailableModelsApiV1AiModelsGet?.mockReturnValue(
        of([{ id: 'm-1', name: 'M1' }]),
      );

      store.loadHistory();

      expect(store.conversations().length).toBe(1);
      expect(store.availableModels().length).toBe(1);
      expect(store.error()).toBeNull();

      expect(store.isDataLoading()).toBe(false);
      expect(store.activeConversationId()).toBeNull();
      expect(store.messages()).toEqual([]);
      expect(store.isGenerating()).toBe(false);
      expect(store.state().conversations.length).toBe(1);
    });

    it('handles various error payloads', () => {
      mockAiApi.listAvailableModelsApiV1AiModelsGet?.mockReturnValue(of([]));

      mockApi.listConversationsApiV1ConversationsGet.mockReturnValue(
        throwError(() => new HttpErrorResponse({ error: { detail: 'String error' } })),
      );
      store.loadHistory();
      expect(store.error()).toBe('String error');

      mockApi.listConversationsApiV1ConversationsGet.mockReturnValue(
        throwError(() => new HttpErrorResponse({ error: { detail: { code: 400 } } })),
      );
      store.loadHistory();
      expect(store.error()).toBe('{"code":400}');

      mockApi.listConversationsApiV1ConversationsGet.mockReturnValue(
        throwError(() => new HttpErrorResponse({ statusText: 'Bad' })),
      );
      store.loadHistory();
      expect(store.error()).toContain('Http failure response');
    });

    it('sets error string on API failure', () => {
      mockApi.listConversationsApiV1ConversationsGet.mockReturnValue(
        throwError(() => new Error('Net Error')),
      );
      store.loadHistory();
      expect(store.error()).toBe('Net Error');
    });

    it('catches missing AI endpoint safely', () => {
      mockApi.listConversationsApiV1ConversationsGet.mockReturnValue(of([]));
      mockAiApi.listAvailableModelsApiV1AiModelsGet?.mockReturnValue(
        throwError(() => new Error('bad')),
      );
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      store.loadHistory();
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it('handles AI Models endpoint missing gracefully', () => {
      mockApi.listConversationsApiV1ConversationsGet.mockReturnValue(of([]));
      delete mockAiApi.listAvailableModelsApiV1AiModelsGet;
      store.loadHistory();
      expect(store.error()).toBeNull();
    });
  });

  describe('selectConversation', () => {
    it('sets state on success', () => {
      mockApi.getMessagesApiV1ConversationsConversationIdMessagesGet.mockReturnValue(
        of([MOCK_MSG]),
      );
      store.selectConversation('c1');
      expect(store.activeConversationId()).toBe('c1');
      expect(store.messages().length).toBe(1);
    });

    it('sets error on failure', () => {
      mockApi.getMessagesApiV1ConversationsConversationIdMessagesGet.mockReturnValue(
        throwError(() => new HttpErrorResponse({ error: { detail: 'Boom' } })),
      );
      store.selectConversation('c1');
      expect(store.error()).toBe('Boom');
    });
  });

  describe('createNewChat', () => {
    it('resets state if active conversation or messages exist', () => {
      store.patch({ activeConversationId: 'c1', messages: [MOCK_MSG] });
      store.createNewChat();
      expect(store.activeConversationId()).toBeNull();
      expect(store.messages().length).toBe(0);
    });

    it('does nothing if already fresh', () => {
      store.patch({ activeConversationId: null, messages: [] });
      const spy = vi.spyOn(store, 'patch');
      store.createNewChat();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('toggleModelSelection', () => {
    it('adds and removes model ids', () => {
      store.toggleModelSelection('M1');
      expect(store.selectedModelIds()).toContain('M1');
      store.toggleModelSelection('M1');
      expect(store.selectedModelIds().length).toBe(0);
    });
  });

  describe('sendMessage', () => {
    it('ignores empty input', () => {
      store.sendMessage('   ');
      expect(mockApi.createConversationApiV1ConversationsPost).not.toHaveBeenCalled();
      expect(
        mockApi.sendMessageApiV1ConversationsConversationIdMessagesPost,
      ).not.toHaveBeenCalled();
    });

    it('creates new conversation if no active ID', () => {
      const resp: ConversationDetail = { ...MOCK_CONV, messages: [MOCK_MSG] };
      mockApi.createConversationApiV1ConversationsPost.mockReturnValue(of(resp));

      store.sendMessage('hello');

      expect(store.activeConversationId()).toBe('c1');
      expect(store.conversations()[0]?.id).toBe('c1');
      expect(store.messages().length).toBe(1);
    });

    it('creates new conversation and handles undefined messages', () => {
      mockApi.createConversationApiV1ConversationsPost.mockReturnValue(of(MOCK_CONV));

      store.sendMessage('hello');

      expect(store.messages().length).toBe(0);
    });

    it('handles new conversation creation error', () => {
      mockApi.createConversationApiV1ConversationsPost.mockReturnValue(
        throwError(() => new Error('Net Error')),
      );
      store.sendMessage('hello');
      expect(store.messages().length).toBe(0);
      expect(store.error()).toBe('Net Error');
    });

    it('sends directly if active conversation exists with selected models', () => {
      store.toggleModelSelection('M1');
      store.patch({ activeConversationId: 'c1', messages: [] });
      mockApi.sendMessageApiV1ConversationsConversationIdMessagesPost.mockReturnValue(of(MOCK_MSG));
      store.sendMessage('hello');

      expect(mockApi.sendMessageApiV1ConversationsConversationIdMessagesPost).toHaveBeenCalledWith(
        'c1',
        { content: 'hello', target_models: ['M1'] },
      );
      expect(store.messages()[1]?.id).toBe('m1');
    });

    it('rolls back temp message on send error', () => {
      store.patch({ activeConversationId: 'c1', messages: [MOCK_MSG] });
      mockApi.sendMessageApiV1ConversationsConversationIdMessagesPost.mockReturnValue(
        throwError(() => new Error('fail')),
      );

      store.sendMessage('hello');
      expect(store.messages().length).toBe(1);
      expect(store.error()).toBe('fail');
    });
  });

  describe('voteCandidate', () => {
    it('early returns when no active conversation or missing entities', () => {
      store.voteCandidate('m1', 'c1');
      expect(
        mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost,
      ).not.toHaveBeenCalled();

      store.patch({ activeConversationId: 'c1', messages: [] });
      store.voteCandidate('m1', 'c1');
      expect(
        mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost,
      ).not.toHaveBeenCalled();
    });

    it('early returns if candidate not found', () => {
      store.patch({ activeConversationId: 'c1', messages: [MOCK_MSG] });
      store.voteCandidate('m1', 'non-existent');
      expect(
        mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost,
      ).not.toHaveBeenCalled();
    });

    it('early returns if message not found in existing conversation', () => {
      store.patch({ activeConversationId: 'c1', messages: [MOCK_MSG] });
      store.voteCandidate('non-existent', 'cand1');
      expect(
        mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost,
      ).not.toHaveBeenCalled();
    });

    it('updates optimistic selection and confirms with server', () => {
      store.patch({ activeConversationId: 'c1', messages: [MOCK_MSG] });

      const serverMsg = { ...MOCK_MSG, content: 'Updated from server' };
      mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost.mockReturnValue(
        of(serverMsg),
      );

      store.voteCandidate('m1', 'cand1');

      expect(store.messages()[0]?.content).toBe('Updated from server');
    });

    it('updates optimistic selection with fallback content and null sql_snippet', () => {
      const msgNoCandContent: MessageResponse = {
        ...MOCK_MSG,
        candidates: [
          createMockCandidate({
            id: 'cand2',
            model_name: 'M2',
            content: '',
            sql_snippet: null,
            sql_hash: null,
            is_selected: false,
          }),
          createMockCandidate({
            id: 'cand3',
            model_name: 'M3',
            content: '',
            sql_snippet: null,
            sql_hash: null,
            is_selected: false,
          }),
        ],
      };
      store.patch({ activeConversationId: 'c1', messages: [msgNoCandContent] });

      mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost.mockReturnValue(
        of(MOCK_MSG),
      );

      store.voteCandidate('m1', 'cand2');
      expect(
        mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost,
      ).toHaveBeenCalled();
    });

    it('handles sql_hash logic during optimistic update', () => {
      const msgWithHash: MessageResponse = {
        ...MOCK_MSG,
        candidates: [
          createMockCandidate({
            id: 'c1',
            model_name: 'M1',
            sql_hash: 'hashA',
            is_selected: false,
          }),
          createMockCandidate({
            id: 'c2',
            model_name: 'M2',
            sql_hash: 'hashA',
            is_selected: false,
          }),
          createMockCandidate({
            id: 'c3',
            model_name: 'M3',
            sql_hash: 'hashB',
            is_selected: false,
          }),
        ],
      };
      store.patch({ activeConversationId: 'c1', messages: [msgWithHash] });

      const subject = new Subject<MessageResponse>();
      mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost.mockReturnValue(
        subject.asObservable(),
      );

      store.voteCandidate('m1', 'c1');

      const optMsg = store.messages()[0];
      expect(optMsg?.candidates?.[0]?.is_selected).toBe(true);
      expect(optMsg?.candidates?.[1]?.is_selected).toBe(true);
      expect(optMsg?.candidates?.[2]?.is_selected).toBe(false);

      subject.next(MOCK_MSG);
    });

    it('handles missing candidates array during optimistic update', () => {
      const msgNoCandidates: MessageResponse = { ...MOCK_MSG };
      delete msgNoCandidates.candidates;
      store.patch({ activeConversationId: 'c1', messages: [msgNoCandidates] });

      store.voteCandidate('m1', 'cand1');
      expect(
        mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost,
      ).not.toHaveBeenCalled();
    });

    it('does nothing on server reply if message was deleted locally in the meantime', () => {
      store.patch({ activeConversationId: 'c1', messages: [MOCK_MSG] });

      const subject = new Subject<MessageResponse>();
      mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost.mockReturnValue(
        subject.asObservable(),
      );

      store.voteCandidate('m1', 'cand1');
      store.patch({ messages: [] });
      subject.next(MOCK_MSG);

      expect(store.messages().length).toBe(0);
    });

    it('rolls back on server error', () => {
      store.patch({ activeConversationId: 'c1', messages: [MOCK_MSG] });
      mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost.mockReturnValue(
        throwError(() => new Error('error')),
      );

      store.voteCandidate('m1', 'cand1');
      expect(store.messages()[0]).toEqual(MOCK_MSG);
      expect(store.error()).toBe('error');
    });
  });

  describe('deleteConversation', () => {
    it('deletes conversation optimistically', () => {
      store.patch({ conversations: [MOCK_CONV], activeConversationId: 'c1' });
      mockApi.deleteConversationApiV1ConversationsConversationIdDelete.mockReturnValue(of({}));

      store.deleteConversation('c1');

      expect(store.conversations().length).toBe(0);
      expect(store.activeConversationId()).toBeNull();
    });

    it('rolls back on failure', () => {
      store.patch({ conversations: [MOCK_CONV], activeConversationId: null });
      mockApi.deleteConversationApiV1ConversationsConversationIdDelete.mockReturnValue(
        throwError(() => new Error('fail')),
      );

      store.deleteConversation('c1');
      expect(store.conversations().length).toBe(1);
    });
  });

  describe('renameConversation', () => {
    it('early returns if conversation not found', () => {
      store.renameConversation('ghost', 'test');
      expect(mockApi.updateConversationApiV1ConversationsConversationIdPut).not.toHaveBeenCalled();
    });

    it('renames optimistically and updates server', () => {
      const conv2 = { ...MOCK_CONV, id: 'c2', title: 'Two' };
      store.patch({ conversations: [MOCK_CONV, conv2] });
      mockApi.updateConversationApiV1ConversationsConversationIdPut.mockReturnValue(of({}));

      store.renameConversation('c1', 'Renamed');
      expect(store.conversations()[0]?.title).toBe('Renamed');
      expect(store.conversations()[1]?.title).toBe('Two');
    });

    it('rolls back on server failure', () => {
      store.patch({ conversations: [MOCK_CONV] });
      mockApi.updateConversationApiV1ConversationsConversationIdPut.mockReturnValue(
        throwError(() => new Error('fail')),
      );

      store.renameConversation('c1', 'Renamed');
      expect(store.conversations()[0]?.title).toBe('Start');
    });
  });

  describe('handleError mapping', () => {
    it('uses fallback detail extracting string from HttpErrorResponse', () => {
      const err = new HttpErrorResponse({ error: { detail: 'Auth Failure' } });
      store.handleError(err);
      expect(store.error()).toBe('Auth Failure');
    });

    it('uses message string as fallback', () => {
      const err = new HttpErrorResponse({ status: 500, statusText: 'Dead', url: 'http' });
      store.handleError(err);
      expect(store.error()).toContain('Http failure');
    });

    it('uses raw string if error is neither HttpErrorResponse nor Error', () => {
      store.handleError('Just a string');
      expect(store.error()).toBe('Error');
    });
  });

  describe('streamResponse', () => {
    it('handles streamResponse success', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(`data: {"event":"token","token":"Hello "}

`),
          );
          controller.enqueue(
            encoder.encode(`data: {"event":"token","token":"World"}

`),
          );
          controller.enqueue(
            encoder.encode(
              `data: {"event":"done","message_id":"msg-1","content":"Hello World","sql_snippet":"SELECT 1"}

`,
            ),
          );
          controller.close();
        },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(mockStream, { status: 200 }));

      safeStorage.setItem('pulse_auth_token', 'mock_token');
      await store.streamResponse('c1', 'model-xyz');
      safeStorage.removeItem('pulse_auth_token');

      expect(store.isStreaming()).toBe(false);
      expect(store.messages().length).toBe(1);
      expect(store.messages()[0]?.content).toBe('Hello World');
      expect(store.messages()[0]?.sql_snippet).toBe('SELECT 1');
    });

    it('handles streamResponse fallback fields, malformed JSON chunks, and natural EOF without done event', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(`comment: ignore
data: {bad json
data: 42
data: {"no_event":true}
`),
          );
          controller.enqueue(
            encoder.encode(`data: {"event":"token","token":"Streamed"}

`),
          );
          controller.enqueue(
            encoder.encode(`data: {"event":"done","sql_snippet":null}
`),
          );
          controller.close();
        },
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(mockStream, { status: 200 }));
      await store.streamResponse('c1');
      expect(store.messages()[store.messages().length - 1]?.content).toBe('Streamed');
      expect(store.messages()[store.messages().length - 1]?.sql_snippet).toBeNull();

      const eofStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(`data: {"event":"done"}

`),
          );
          controller.close();
        },
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(eofStream, { status: 200 }));
      await store.streamResponse('c1');
      expect(store.messages()[store.messages().length - 1]?.content).toBe('');

      const noDoneStream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(`data: {"event":"other"}

`),
          );
          controller.close();
        },
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(noDoneStream, { status: 200 }));
      await store.streamResponse('c1');
      expect(store.isStreaming()).toBe(false);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
      await store.streamResponse('c1');
      expect(store.error()).toBe('Readable stream not supported');
    });

    it('handles streamResponse network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection Failed'));

      await store.streamResponse('c1');

      expect(store.isStreaming()).toBe(false);
      expect(store.streamingMessageContent()).toBeNull();
      expect(store.error()).toBe('Connection Failed');
    });

    it('handles non-200 stream response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Error', { status: 500 }));

      await store.streamResponse('c1');

      expect(store.isStreaming()).toBe(false);
      expect(store.error()).toContain('Streaming failed with status: 500');
    });
  });
});
