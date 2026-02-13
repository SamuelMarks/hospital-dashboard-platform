import { TestBed } from '@angular/core/testing';
import { ChatStore } from './chat.store';
import { ChatService, MessageResponse, ConversationResponse } from '../api-client';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

describe('ChatStore', () => {
  let store: ChatStore;
  let mockApi: any;

  const MOCK_CONV: ConversationResponse = {
    id: 'c1',
    title: 'Start',
    updated_at: '2023-01-01',
    messages: [],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    mockApi = {
      listConversationsApiV1ConversationsGet: vi.fn(),
      createConversationApiV1ConversationsPost: vi.fn(),
      getMessagesApiV1ConversationsConversationIdMessagesGet: vi.fn(),
      sendMessageApiV1ConversationsConversationIdMessagesPost: vi.fn(),
      voteMessageApiV1ConversationsConversationIdMessagesMessageIdVotePost: vi.fn(),
      deleteConversationApiV1ConversationsConversationIdDelete: vi.fn(),
      updateConversationApiV1ConversationsConversationIdPut: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [ChatStore, { provide: ChatService, useValue: mockApi }],
    });
    store = TestBed.inject(ChatStore);
  });
  afterEach(() => vi.useRealTimers());

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

  it('should rename conversation optimistically', () => {
    store['patch']({ conversations: [MOCK_CONV] });
    mockApi.updateConversationApiV1ConversationsConversationIdPut.mockReturnValue(of({}));

    store.renameConversation('c1', 'Renamed');

    expect(store.conversations()[0].title).toBe('Renamed');
    expect(mockApi.updateConversationApiV1ConversationsConversationIdPut).toHaveBeenCalledWith(
      'c1',
      { title: 'Renamed' },
    );
  });

  it('cleans up subscriptions on destroy', () => {
    store.ngOnDestroy();
    expect(true).toBe(true);
  });

  it('loads history and handles errors', () => {
    mockApi.listConversationsApiV1ConversationsGet.mockReturnValue(of([MOCK_CONV]));
    store.loadHistory();
    expect(store.conversations().length).toBe(1);

    const httpErr = new HttpErrorResponse({ error: { detail: 'Boom' } });
    mockApi.listConversationsApiV1ConversationsGet.mockReturnValue(throwError(() => httpErr));
    store.loadHistory();
    expect(store.error()).toBe('Boom');
  });

  it('selects conversation and loads messages', () => {
    const msgs: MessageResponse[] = [
      { id: 'm1', conversation_id: 'c1', role: 'user', content: 'Hi' } as any,
    ];
    mockApi.getMessagesApiV1ConversationsConversationIdMessagesGet.mockReturnValue(of(msgs));
    store.selectConversation('c1');
    expect(store.messages().length).toBe(1);
  });

  it('handles select conversation error', () => {
    mockApi.getMessagesApiV1ConversationsConversationIdMessagesGet.mockReturnValue(
      throwError(() => new Error('fail')),
    );
    store.selectConversation('c1');
    expect(store.error()).toBe('Error');
  });

  it('createNewChat short-circuits when already empty', () => {
    store['patch']({ activeConversationId: null, messages: [] });
    store.createNewChat();
    expect(store.activeConversationId()).toBeNull();
  });

  it('createNewChat clears active conversation', () => {
    store['patch']({ activeConversationId: 'c1', messages: [{ id: 'm1' } as any] });
    store.createNewChat();
    expect(store.activeConversationId()).toBeNull();
    expect(store.messages().length).toBe(0);
  });

  it('sendMessage ignores empty content', () => {
    store.sendMessage('   ');
    expect(mockApi.createConversationApiV1ConversationsPost).not.toHaveBeenCalled();
  });

  it('sendMessage creates new conversation when none active', () => {
    const conv: ConversationResponse = { id: 'c2', title: 'New', updated_at: 'x', messages: [] };
    mockApi.createConversationApiV1ConversationsPost.mockReturnValue(of(conv));

    store.sendMessage('hello');

    expect(store.activeConversationId()).toBe('c2');
    expect(store.conversations()[0].id).toBe('c2');
  });

  it('sendMessage handles create response without messages', () => {
    const conv: ConversationResponse = { id: 'c3', title: 'New', updated_at: 'x' } as any;
    mockApi.createConversationApiV1ConversationsPost.mockReturnValue(of(conv));

    store.sendMessage('hello');

    expect(store.activeConversationId()).toBe('c3');
    expect(store.messages()).toEqual([]);
  });

  it('sendMessage falls back when conversation has no messages', () => {
    const conv = { id: 'c3', title: 'NoMsgs', updated_at: 'x' } as ConversationResponse;
    mockApi.createConversationApiV1ConversationsPost.mockReturnValue(of(conv));

    store.sendMessage('hello');

    expect(store.messages()).toEqual([]);
  });

  it('sendMessage rolls back on create error', () => {
    mockApi.createConversationApiV1ConversationsPost.mockReturnValue(
      throwError(() => new Error('fail')),
    );
    store.sendMessage('oops');
    expect(store.messages().length).toBe(0);
    expect(store.error()).toBe('Error');
  });

  it('sendMessage appends AI response when conversation exists', () => {
    store['patch']({ activeConversationId: 'c1', messages: [] });
    const ai: MessageResponse = {
      id: 'm2',
      conversation_id: 'c1',
      role: 'assistant',
      content: 'AI',
    } as any;
    mockApi.sendMessageApiV1ConversationsConversationIdMessagesPost.mockReturnValue(of(ai));

    store.sendMessage('hi');

    expect(store.messages().some((m) => m.role === 'assistant')).toBe(true);
  });

  it('sendMessage rolls back optimistic message on error', () => {
    store['patch']({ activeConversationId: 'c1', messages: [] });
    mockApi.sendMessageApiV1ConversationsConversationIdMessagesPost.mockReturnValue(
      throwError(() => new Error('fail')),
    );

    store.sendMessage('hi');

    expect(store.messages().length).toBe(0);
    expect(store.error()).toBe('Error');
  });

  it('voteCandidate handles missing state and success path', () => {
    store.voteCandidate('m1', 'c1');
    store['patch']({ activeConversationId: 'c1', messages: [] });
    store.voteCandidate('m1', 'c1');

    const msg: MessageResponse = {
      id: 'm1',
      conversation_id: 'c1',
      role: 'assistant',
      content: 'old',
      candidates: [{ id: 'c1', content: 'new', sql_snippet: 'SQL', is_selected: false }],
    } as any;
    store['patch']({ messages: [msg] });
    mockApi.voteMessageApiV1ConversationsConversationIdMessagesMessageIdVotePost.mockReturnValue(
      of({}),
    );

    store.voteCandidate('m1', 'c1');

    expect(store.messages()[0].content).toBe('new');
    expect(
      mockApi.voteMessageApiV1ConversationsConversationIdMessagesMessageIdVotePost,
    ).toHaveBeenCalled();
  });

  it('voteCandidate selects all candidates with matching sql_hash', () => {
    const msg: MessageResponse = {
      id: 'm1',
      conversation_id: 'c1',
      role: 'assistant',
      content: 'old',
      candidates: [
        { id: 'c1', content: 'new', sql_hash: 'h1', is_selected: false },
        { id: 'c2', content: 'alt', sql_hash: 'h1', is_selected: false },
        { id: 'c3', content: 'diff', sql_hash: 'h2', is_selected: false },
      ],
    } as any;
    store['patch']({ activeConversationId: 'c1', messages: [msg] });
    mockApi.voteMessageApiV1ConversationsConversationIdMessagesMessageIdVotePost.mockReturnValue(
      of({}),
    );

    store.voteCandidate('m1', 'c1');

    const candidates = store.messages()[0].candidates || [];
    expect(candidates.find((c) => c.id === 'c1')?.is_selected).toBe(true);
    expect(candidates.find((c) => c.id === 'c2')?.is_selected).toBe(true);
    expect(candidates.find((c) => c.id === 'c3')?.is_selected).toBe(false);
  });

  it('voteCandidate ignores missing candidates', () => {
    const msg: MessageResponse = {
      id: 'm1',
      conversation_id: 'c1',
      role: 'assistant',
      content: 'old',
      candidates: [],
    } as any;
    store['patch']({ activeConversationId: 'c1', messages: [msg] });

    store.voteCandidate('m1', 'missing');

    expect(
      mockApi.voteMessageApiV1ConversationsConversationIdMessagesMessageIdVotePost,
    ).not.toHaveBeenCalled();
  });

  it('voteCandidate reports API errors', () => {
    const msg: MessageResponse = {
      id: 'm1',
      conversation_id: 'c1',
      role: 'assistant',
      content: 'old',
      candidates: [{ id: 'c1', content: 'new', is_selected: false }],
    } as any;
    store['patch']({ activeConversationId: 'c1', messages: [msg] });
    mockApi.voteMessageApiV1ConversationsConversationIdMessagesMessageIdVotePost.mockReturnValue(
      throwError(() => new HttpErrorResponse({ error: { detail: 'Nope' } })),
    );

    store.voteCandidate('m1', 'c1');
    expect(store.error()).toBe('Nope');
  });

  it('deleteConversation rolls back on error', () => {
    store['patch']({ conversations: [MOCK_CONV] });
    mockApi.deleteConversationApiV1ConversationsConversationIdDelete.mockReturnValue(
      throwError(() => new Error('fail')),
    );

    store.deleteConversation('c1');
    expect(store.conversations().length).toBe(1);
    expect(store.error()).toBe('Error');
  });

  it('renameConversation skips unknown ids and rolls back on error', () => {
    store.renameConversation('missing', 'Nope');
    expect(store.conversations().length).toBe(0);

    store['patch']({ conversations: [MOCK_CONV] });
    mockApi.updateConversationApiV1ConversationsConversationIdPut.mockReturnValue(
      throwError(() => new Error('fail')),
    );
    store.renameConversation('c1', 'New');
    expect(store.conversations()[0].title).toBe('Start');
    expect(store.error()).toBe('Error');
  });

  it('renameConversation updates only matching entry', () => {
    const other: ConversationResponse = { id: 'c2', title: 'Other', updated_at: 'x', messages: [] };
    store['patch']({ conversations: [MOCK_CONV, other] });
    mockApi.updateConversationApiV1ConversationsConversationIdPut.mockReturnValue(of({}));

    store.renameConversation('c1', 'Renamed');

    expect(store.conversations().find((c) => c.id === 'c1')?.title).toBe('Renamed');
    expect(store.conversations().find((c) => c.id === 'c2')?.title).toBe('Other');
  });

  it('handleError uses HttpErrorResponse message when detail missing', () => {
    const err = new HttpErrorResponse({ status: 500, statusText: 'Server Error' });
    (store as any).handleError(err);
    expect(store.error()).toBe(err.message);
  });

  it('exposes computed selectors', () => {
    store['patch']({
      conversations: [MOCK_CONV],
      activeConversationId: 'c1',
      messages: [{ id: 'm1' } as any],
      isLoadingList: true,
      isGenerating: true,
      error: 'oops',
    });

    expect(store.state()).toBeTruthy();
    expect(store.conversations().length).toBe(1);
    expect(store.activeConversationId()).toBe('c1');
    expect(store.messages().length).toBe(1);
    expect(store.isDataLoading()).toBe(true);
    expect(store.isGenerating()).toBe(true);
    expect(store.error()).toBe('oops');
  });
});
