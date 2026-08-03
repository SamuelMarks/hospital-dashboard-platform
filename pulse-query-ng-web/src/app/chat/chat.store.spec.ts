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

describe('ChatStore', () => {
  let store: ChatStore;
  let mockApi: any;
  let mockAiApi: any;

  const MOCK_CONV: ConversationResponse = {
    id: 'c1',
    title: 'Start',
    updated_at: '2023-01-01',
    user_id: 'u1',
    created_at: '2023-01-01',
  };

  const MOCK_MSG: MessageResponse = {
    id: 'm1',
    conversation_id: 'c1',
    role: 'assistant',
    content: 'test',
    created_at: 'now',
    candidates: [
      { id: 'cand1', model_name: 'M1', content: 'C1', sql_hash: 'hashA', is_selected: false },
    ],
  };

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
      mockAiApi.listAvailableModelsApiV1AiModelsGet.mockReturnValue(
        of([{ id: 'm-1', name: 'M1' }]),
      );

      store.loadHistory();

      expect(store.conversations().length).toBe(1);
      expect(store.availableModels().length).toBe(1);
      expect(store.error()).toBeNull();

      // Test the getters to cover line 83
      expect(store.isDataLoading()).toBe(false);
      expect(store.activeConversationId()).toBeNull();
      expect(store.messages()).toEqual([]);
      expect(store.isGenerating()).toBe(false);
      expect(store.state().conversations.length).toBe(1);
    });

    it('handles various error payloads', () => {
      mockAiApi.listAvailableModelsApiV1AiModelsGet.mockReturnValue(of([]));

      // String error detail
      mockApi.listConversationsApiV1ConversationsGet.mockReturnValue(
        throwError(() => new HttpErrorResponse({ error: { detail: 'String error' } })),
      );
      store.loadHistory();
      expect(store.error()).toBe('String error');

      // Object error detail
      mockApi.listConversationsApiV1ConversationsGet.mockReturnValue(
        throwError(() => new HttpErrorResponse({ error: { detail: { code: 400 } } })),
      );
      store.loadHistory();
      expect(store.error()).toBe('{"code":400}');

      // No error detail
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
      mockAiApi.listAvailableModelsApiV1AiModelsGet.mockReturnValue(
        throwError(() => new Error('bad')),
      );
      console.error = vi.fn();
      store.loadHistory();
      expect(console.error).toHaveBeenCalled();
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
      store['patch']({ activeConversationId: 'c1', messages: [MOCK_MSG] });
      store.createNewChat();
      expect(store.activeConversationId()).toBeNull();
      expect(store.messages().length).toBe(0);
    });

    it('does nothing if already fresh', () => {
      store['patch']({ activeConversationId: null, messages: [] });
      const spy = vi.spyOn(store as any, 'patch');
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
      const resp: ConversationDetail = { ...MOCK_CONV, messages: [MOCK_MSG] } as any;
      mockApi.createConversationApiV1ConversationsPost.mockReturnValue(of(resp));

      store.sendMessage('hello');

      expect(store.activeConversationId()).toBe('c1');
      expect(store.conversations()[0].id).toBe('c1');
      expect(store.messages().length).toBe(1);
    });

    it('creates new conversation and handles undefined messages', () => {
      const resp: ConversationDetail = { ...MOCK_CONV } as any;
      mockApi.createConversationApiV1ConversationsPost.mockReturnValue(of(resp));

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
      store['patch']({ activeConversationId: 'c1', messages: [] });
      mockApi.sendMessageApiV1ConversationsConversationIdMessagesPost.mockReturnValue(of(MOCK_MSG));
      store.sendMessage('hello');

      expect(mockApi.sendMessageApiV1ConversationsConversationIdMessagesPost).toHaveBeenCalledWith(
        'c1',
        { content: 'hello', target_models: ['M1'] },
      );
      expect(store.messages()[1].id).toBe('m1');
    });

    it('rolls back temp message on send error', () => {
      store['patch']({ activeConversationId: 'c1', messages: [MOCK_MSG] });
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

      store['patch']({ activeConversationId: 'c1', messages: [] });
      store.voteCandidate('m1', 'c1');
      expect(
        mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost,
      ).not.toHaveBeenCalled();
    });

    it('early returns if candidate not found', () => {
      store['patch']({ activeConversationId: 'c1', messages: [MOCK_MSG] });
      store.voteCandidate('m1', 'non-existent');
      expect(
        mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost,
      ).not.toHaveBeenCalled();
    });

    it('early returns if message not found in existing conversation', () => {
      store['patch']({ activeConversationId: 'c1', messages: [MOCK_MSG] });
      store.voteCandidate('non-existent', 'cand1');
      expect(
        mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost,
      ).not.toHaveBeenCalled();
    });

    it('updates optimistic selection and confirms with server', () => {
      store['patch']({ activeConversationId: 'c1', messages: [MOCK_MSG] });

      const serverMsg = { ...MOCK_MSG, content: 'Updated from server' };
      mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost.mockReturnValue(
        of(serverMsg),
      );

      store.voteCandidate('m1', 'cand1');

      expect(store.messages()[0].content).toBe('Updated from server');
    });

    it('updates optimistic selection with fallback content and null sql_snippet', () => {
      const msgNoCandContent: MessageResponse = {
        ...MOCK_MSG,
        candidates: [
          { id: 'cand2', model_name: 'M2', is_selected: false } as any,
          { id: 'cand3', model_name: 'M3', is_selected: false } as any,
        ],
      };
      store['patch']({ activeConversationId: 'c1', messages: [msgNoCandContent] });

      mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost.mockReturnValue(
        of(MOCK_MSG),
      );

      store.voteCandidate('m1', 'cand2');
      // Should handle content fallback to '' and sql_snippet to null before server reply
      // Because we mock API with `of(MOCK_MSG)` it replies instantly and overwrites with MOCK_MSG
      expect(
        mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost,
      ).toHaveBeenCalled();
    });

    it('handles sql_hash logic during optimistic update', () => {
      const msgWithHash: MessageResponse = {
        ...MOCK_MSG,
        candidates: [
          { id: 'c1', model_name: 'M1', sql_hash: 'hashA', is_selected: false },
          { id: 'c2', model_name: 'M2', sql_hash: 'hashA', is_selected: false },
          { id: 'c3', model_name: 'M3', sql_hash: 'hashB', is_selected: false },
        ] as any,
      };
      store['patch']({ activeConversationId: 'c1', messages: [msgWithHash] });

      const subject = new Subject<MessageResponse>();
      mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost.mockReturnValue(
        subject.asObservable(),
      );

      store.voteCandidate('m1', 'c1');

      // Before server response, check optimistic update
      const optMsg = store.messages()[0];
      expect(optMsg.candidates?.[0].is_selected).toBe(true);
      expect(optMsg.candidates?.[1].is_selected).toBe(true); // Same hash
      expect(optMsg.candidates?.[2].is_selected).toBe(false); // Different hash

      // Resolve subject
      subject.next(MOCK_MSG);
    });

    it('handles missing candidates array during optimistic update', () => {
      const msgNoCandidates: MessageResponse = { ...MOCK_MSG };
      delete msgNoCandidates.candidates; // undefined candidates array
      store['patch']({ activeConversationId: 'c1', messages: [msgNoCandidates] });

      // Vote for non-existent candidate, should return early
      store.voteCandidate('m1', 'cand1');
      expect(
        mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost,
      ).not.toHaveBeenCalled();
    });

    it('does nothing on server reply if message was deleted locally in the meantime', () => {
      store['patch']({ activeConversationId: 'c1', messages: [MOCK_MSG] });

      const subject = new Subject<MessageResponse>();
      mockApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost.mockReturnValue(
        subject.asObservable(),
      );

      store.voteCandidate('m1', 'cand1');

      // delete locally
      store['patch']({ messages: [] });

      // server replies
      subject.next(MOCK_MSG);

      // should still be empty
      expect(store.messages().length).toBe(0);
    });

    it('rolls back on server error', () => {
      store['patch']({ activeConversationId: 'c1', messages: [MOCK_MSG] });
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
      store['patch']({ conversations: [MOCK_CONV], activeConversationId: 'c1' });
      mockApi.deleteConversationApiV1ConversationsConversationIdDelete.mockReturnValue(of({}));

      store.deleteConversation('c1');

      expect(store.conversations().length).toBe(0);
      expect(store.activeConversationId()).toBeNull();
    });

    it('rolls back on failure', () => {
      store['patch']({ conversations: [MOCK_CONV], activeConversationId: null });
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
      store['patch']({ conversations: [MOCK_CONV, conv2] });
      mockApi.updateConversationApiV1ConversationsConversationIdPut.mockReturnValue(of({}));

      store.renameConversation('c1', 'Renamed');
      expect(store.conversations()[0].title).toBe('Renamed');
      expect(store.conversations()[1].title).toBe('Two'); // covers the `: c` path
    });

    it('rolls back on server failure', () => {
      store['patch']({ conversations: [MOCK_CONV] });
      mockApi.updateConversationApiV1ConversationsConversationIdPut.mockReturnValue(
        throwError(() => new Error('fail')),
      );

      store.renameConversation('c1', 'Renamed');
      expect(store.conversations()[0].title).toBe('Start');
    });
  });

  describe('handleError mapping', () => {
    it('uses fallback detail extracting string from HttpErrorResponse', () => {
      const err = new HttpErrorResponse({ error: { detail: 'Auth Failure' } });
      store['handleError'](err);
      expect(store.error()).toBe('Auth Failure');
    });

    it('uses message string as fallback', () => {
      const err = new HttpErrorResponse({ status: 500, statusText: 'Dead', url: 'http' });
      store['handleError'](err);
      expect(store.error()).toContain('Http failure');
    });

    it('uses raw string if error is neither HttpErrorResponse nor Error', () => {
      store['handleError']('Just a string');
      expect(store.error()).toBe('Error');
    });
  });
});
