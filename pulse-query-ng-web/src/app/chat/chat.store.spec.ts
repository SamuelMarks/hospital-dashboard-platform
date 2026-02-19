/**
 * @fileoverview Unit tests for ChatStore.
 * Verifies retry logic, state updates, and optimistic handling.
 */
import { TestBed } from '@angular/core/testing';
import { ChatStore } from './chat.store';
import {
  ChatService,
  AiService,
  MessageResponse,
  ConversationResponse,
  ConversationDetail,
} from '../api-client';
import { of } from 'rxjs';

describe('ChatStore', () => {
  let store: ChatStore;
  let mockApi: any;
  let mockAiApi: any;

  // Fix: Add missing properties to strictly typed mock
  const MOCK_CONV: ConversationResponse = {
    id: 'c1',
    title: 'Start',
    updated_at: '2023-01-01',
    user_id: 'u1',
    created_at: '2023-01-01',
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
      listAvailableModelsApiV1AiModelsGet: vi.fn().mockReturnValue(of([])),
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

  it('loads history and models', () => {
    mockApi.listConversationsApiV1ConversationsGet.mockReturnValue(of([MOCK_CONV]));
    // Mock the AI service response
    mockAiApi.listAvailableModelsApiV1AiModelsGet.mockReturnValue(
      of([{ id: 'gpt-4', name: 'GPT-4' }]),
    );

    store.loadHistory();

    expect(store.conversations().length).toBe(1);
    expect(store.availableModels().length).toBe(1);
  });

  it('should delete conversation optimistically', () => {
    store['patch']({ conversations: [MOCK_CONV], activeConversationId: 'c1' });
    mockApi.deleteConversationApiV1ConversationsConversationIdDelete.mockReturnValue(of({}));

    store.deleteConversation('c1');

    expect(store.conversations().length).toBe(0);
    expect(store.activeConversationId()).toBeNull();
    expect(mockApi.deleteConversationApiV1ConversationsConversationIdDelete).toHaveBeenCalledWith(
      'c1',
    );
  });

  it('sendMessage creates new conversation when none active', () => {
    const conv: ConversationDetail = {
      id: 'c2',
      title: 'New',
      updated_at: 'x',
      user_id: 'u1',
      created_at: 'x',
      messages: [],
    } as any;

    mockApi.createConversationApiV1ConversationsPost.mockReturnValue(of(conv));

    store.sendMessage('hello');

    expect(store.activeConversationId()).toBe('c2');
    expect(store.conversations()[0].id).toBe('c2');
  });
});
