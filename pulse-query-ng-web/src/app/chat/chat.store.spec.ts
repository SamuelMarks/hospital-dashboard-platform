/**
 * @fileoverview Unit tests for ChatStore.
 * Verifies key logic:
 * 1. Optimistic Updates.
 * 2. Conversation Creation vs Appending.
 * 3. Selector state flow.
 */

import { TestBed } from '@angular/core/testing';
import { ChatStore } from './chat.store';
import { ChatService, MessageResponse, ConversationResponse } from '../api-client';
import { of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';

describe('ChatStore', () => {
  let store: ChatStore;
  let mockApi: {
    listConversationsApiV1ConversationsGet: ReturnType<typeof vi.fn>;
    createConversationApiV1ConversationsPost: ReturnType<typeof vi.fn>;
    getMessagesApiV1ConversationsConversationIdMessagesGet: ReturnType<typeof vi.fn>;
    sendMessageApiV1ConversationsConversationIdMessagesPost: ReturnType<typeof vi.fn>;
  };

  const MOCK_CONV: ConversationResponse = { 
    id: 'c1', 
    title: 'New Chat', 
    updated_at: '2023-01-01T00:00:00Z', 
    messages: [] 
  };
  
  const MOCK_MSG_AI: MessageResponse = { 
    id: 'm2', 
    conversation_id: 'c1',
    role: 'assistant', 
    content: 'Reply', 
    created_at: '2023-01-01T00:00:05Z' 
  };

  beforeEach(() => {
    vi.useFakeTimers();

    mockApi = {
      listConversationsApiV1ConversationsGet: vi.fn(),
      createConversationApiV1ConversationsPost: vi.fn(),
      getMessagesApiV1ConversationsConversationIdMessagesGet: vi.fn(),
      sendMessageApiV1ConversationsConversationIdMessagesPost: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        ChatStore,
        { provide: ChatService, useValue: mockApi }
      ]
    });

    store = TestBed.inject(ChatStore);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with empty state', () => {
    expect(store.conversations()).toEqual([]);
    expect(store.messages()).toEqual([]);
    expect(store.isGenerating()).toBe(false);
  });

  it('should load history', () => {
    mockApi.listConversationsApiV1ConversationsGet.mockReturnValue(of([MOCK_CONV]));

    store.loadHistory();

    expect(store.isDataLoading()).toBe(false); // finalized
    expect(store.conversations().length).toBe(1);
    expect(store.conversations()[0].id).toBe('c1');
  });

  it('should select conversation and load messages', () => {
    const msgs: MessageResponse[] = [{ 
      id: 'm1', 
      conversation_id: 'c1',
      role: 'user', 
      content: 'Hi',
      created_at: '2023-01-01T00:00:00Z'
    }];
    mockApi.getMessagesApiV1ConversationsConversationIdMessagesGet.mockReturnValue(of(msgs));

    store.selectConversation('c1');

    expect(store.activeConversationId()).toBe('c1');
    expect(store.isDataLoading()).toBe(false);
    expect(store.messages()).toEqual(msgs);
  });

  describe('sendMessage', () => {
    it('should create new conversation if none active', () => {
      // Response includes the user message + AI message
      const fullConv: ConversationResponse = {
        ...MOCK_CONV,
        messages: [
          { 
            id: 'm1', 
            conversation_id: 'c1', 
            role: 'user', 
            content: 'Hello', 
            created_at: '2023-01-01T00:00:00Z' 
          }, 
          MOCK_MSG_AI
        ]
      };
      
      // FIX: Use delay to prevent synchronous emission from defeating optimistic UI check
      mockApi.createConversationApiV1ConversationsPost.mockReturnValue(of(fullConv).pipe(delay(10)));

      // Action
      store.sendMessage('Hello');

      // Optimistic Check
      expect(store.messages().length).toBe(1);
      expect(store.messages()[0].content).toBe('Hello');
      expect(store.isGenerating()).toBe(true);

      // Resolve
      vi.advanceTimersByTime(10);

      // Final Check
      expect(store.activeConversationId()).toBe('c1');
      expect(store.messages().length).toBe(2); // Replaced by backend sourcing
      expect(store.isGenerating()).toBe(false);
      
      const storedConv = store.conversations().find(c => c.id === 'c1');
      expect(storedConv).toBeTruthy();
    });

    it('should append to existing conversation', () => {
      // Setup active state
      store['patch']({ 
        activeConversationId: 'c1', 
        messages: [{ 
          id: 'm1', 
          conversation_id: 'c1',
          role: 'user', 
          content: 'Prev',
          created_at: '2023-01-01T00:00:00Z'
        }] 
      });

      // FIX: Use delay to ensure optimistic state is assertable
      mockApi.sendMessageApiV1ConversationsConversationIdMessagesPost.mockReturnValue(of(MOCK_MSG_AI).pipe(delay(5)));

      store.sendMessage('Next');

      // Optimistic
      expect(store.messages().length).toBe(2); // Prev + Next (Optimistic)

      // Resolve
      vi.advanceTimersByTime(5); // Advance past delay
      
      expect(store.isGenerating()).toBe(false);
      expect(store.messages().length).toBe(3); // Prev + Next + AI
      expect(store.messages()[2]).toEqual(MOCK_MSG_AI);
    });

    it('should rollback on error', () => {
      // FIX: Use HttpErrorResponse to trigger the specific error parsing logic in store
      const errRes = new HttpErrorResponse({
        error: { detail: 'Fail' },
        status: 500,
        statusText: 'Server Error'
      });
      mockApi.createConversationApiV1ConversationsPost.mockReturnValue(throwError(() => errRes));

      store.sendMessage('Boom');

      expect(store.messages().length).toBe(0); // Rolled back
      expect(store.error()).toBe('Fail');
      expect(store.isGenerating()).toBe(false);
    });
  });

  it('should reset state on createNewChat', () => {
    store['patch']({ activeConversationId: 'c1', messages: [MOCK_MSG_AI] });

    store.createNewChat();

    expect(store.activeConversationId()).toBeNull();
    expect(store.messages().length).toBe(0);
  });
});