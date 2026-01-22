import { TestBed } from '@angular/core/testing'; 
import { ChatStore } from './chat.store'; 
import { ChatService, MessageResponse, ConversationResponse } from '../api-client'; 
import { of } from 'rxjs'; 

describe('ChatStore', () => { 
  let store: ChatStore; 
  let mockApi: any; 

  const MOCK_CONV: ConversationResponse = { id: 'c1', title: 'Start', updated_at: '2023-01-01', messages: [] }; 

  beforeEach(() => { 
    vi.useFakeTimers(); 
    mockApi = { 
      listConversationsApiV1ConversationsGet: vi.fn(), 
      createConversationApiV1ConversationsPost: vi.fn(), 
      getMessagesApiV1ConversationsConversationIdMessagesGet: vi.fn(), 
      sendMessageApiV1ConversationsConversationIdMessagesPost: vi.fn(), 
      voteMessageApiV1ConversationsConversationIdMessagesMessageIdVotePost: vi.fn(), 
      deleteConversationApiV1ConversationsConversationIdDelete: vi.fn(), 
      updateConversationApiV1ConversationsConversationIdPut: vi.fn() 
    }; 
    TestBed.configureTestingModule({ providers: [ChatStore, { provide: ChatService, useValue: mockApi }] }); 
    store = TestBed.inject(ChatStore); 
  }); 
  afterEach(() => vi.useRealTimers()); 

  it('should delete conversation optimistically', () => { 
    store['patch']({ conversations: [MOCK_CONV], activeConversationId: 'c1' }); 
    mockApi.deleteConversationApiV1ConversationsConversationIdDelete.mockReturnValue(of({})); 

    store.deleteConversation('c1'); 

    expect(store.conversations().length).toBe(0); 
    expect(store.activeConversationId()).toBeNull(); 
    expect(mockApi.deleteConversationApiV1ConversationsConversationIdDelete).toHaveBeenCalledWith('c1'); 
  }); 

  it('should rename conversation optimistically', () => { 
    store['patch']({ conversations: [MOCK_CONV] }); 
    mockApi.updateConversationApiV1ConversationsConversationIdPut.mockReturnValue(of({})); 

    store.renameConversation('c1', 'Renamed'); 

    expect(store.conversations()[0].title).toBe('Renamed'); 
    expect(mockApi.updateConversationApiV1ConversationsConversationIdPut).toHaveBeenCalledWith('c1', { title: 'Renamed' }); 
  }); 
});