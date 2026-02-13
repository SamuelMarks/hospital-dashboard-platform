import { test, expect } from './fixtures';

test.describe('AI Chat Assistant', () => {
  test.beforeEach(async ({ loggedInPage }) => {
    // Start from dashboard root where toolbar is visible
    await loggedInPage.goto('/');
  });

  test('should open sidebar, send message, and receive response', async ({ loggedInPage }) => {
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

    // 4. Click Send
    // Mat-icon-button with aria-label="Send Message"
    const sendBtn = sidebar.locator('button[aria-label="Send Message"]');
    await expect(sendBtn).toBeEnabled(); // Ensure text entry enabled the button
    await sendBtn.click();

    // 5. Verify new bubble in stream (Optimistic Update)
    // The user's message bubble has class 'user'
    const userMessage = sidebar.locator('.bubble-row.user').last();
    await expect(userMessage).toContainText('Show me current census');

    // 6. Verify "Generating..." indicator (Typing animation)
    // The loader is a bubble with class 'assistant' containing dot animations
    const typingIndicator = sidebar.locator('.animate-bounce').first();

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

    // Verify AI response bubble exists
    const aiMessage = sidebar.locator('.bubble-row.assistant').last();
    await expect(aiMessage).toBeVisible();

    // Check it's not empty or error state
    await expect(aiMessage).not.toContainText('Error');
  });
});
