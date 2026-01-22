import { test, expect } from './fixtures';

test('dashboard should load for authenticated user', async ({ loggedInPage }) => {
  // Fixture logs in, which now redirects to '/'
  await expect(loggedInPage).toHaveURL('http://localhost:4200/');

  // Check for the Landing Page Heading
  await expect(loggedInPage.getByRole('heading', { name: 'My Dashboards' })).toBeVisible();
});