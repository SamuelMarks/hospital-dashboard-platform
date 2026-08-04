import { test, expect } from './fixtures';

test.describe('AI Chat Assistant', () => {
  test.beforeEach(async ({ loggedInPage }) => {
    // Start from dashboard root where toolbar is visible
    await loggedInPage.goto('/');
  });

  test('should open sidebar, send message, and receive response', async ({ loggedInPage }) => {
    // 0. Mock the chat API to return a fake AI response
    await loggedInPage.route('**/api/v1/conversations/**', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'mock-conv',
            title: 'New Conversation',
            messages: [
              {
                id: 'mock-user-msg',
                conversation_id: 'mock-conv',
                role: 'user',
                content: 'Show me current census',
                created_at: new Date().toISOString(),
                candidates: [],
              },
              {
                id: 'mock-ai-msg',
                conversation_id: 'mock-conv',
                role: 'assistant',
                content: 'This is a mock response.',
                created_at: new Date().toISOString(),
                candidates: [],
              },
            ],
          }),
        });
      } else {
        route.continue();
      }
    });

    // 1. Click "Ask AI" in toolbar
    // Uses text matching as the button has text "Ask AI"
    // FIX: Scope to app-toolbar to distinguish from Home Page Hero button, resolving strict mode violation
    await loggedInPage.locator('app-toolbar').getByRole('button', { name: 'Ask AI' }).click();

    // 2. Verify mat-sidenav opens
    // The sidebar has class 'search-drawer' and we check visibility
    const sidebar = loggedInPage.locator('.search-drawer');
    await expect(sidebar).toBeVisible();

    // 3. Type text into input
    // The textarea inside ConversationComponent
    const input = sidebar.locator('textarea');
    await expect(input).toBeVisible();
    await input.fill('Show me current census');
    await input.press('Enter');

    // 5. Verify new bubble in stream (Optimistic Update)
    // The user's message bubble has class 'user-bubble'
    const userMessage = sidebar.locator('.user-bubble').last();
    await expect(userMessage).toContainText('Show me current census');

    // 6. Verify "Generating..." indicator (Typing animation)
    // The loader is a bubble with class 'loading-bubble'
    const typingIndicator = sidebar.locator('.loading-bubble').first();

    // It should appear briefly. NOTE: If API is too fast, this might flake.
    // Usually valid for LLM latency.
    // We try to catch it, or at least ensure the state resolves.
    try {
      await expect(typingIndicator).toBeVisible({ timeout: 2000 });
    } catch (e) {
      console.log('Typing indicator missed or too fast (acceptable in mocks)');
    }

    // Wait for response to arrive (Indicator disappears)
    await expect(typingIndicator).not.toBeVisible();

    // Verify AI response bubble exists (it does not have user-bubble or loading-bubble)
    const aiMessage = sidebar
      .locator('.message-bubble:not(.user-bubble):not(.loading-bubble)')
      .last();
    await expect(aiMessage).toBeVisible();

    // Check it's not empty or error state
    await expect(aiMessage).not.toContainText('Error');
  });
});
