import { test, expect } from '@playwright/test';

test('take screenshot of appointments page', async ({ page }) => {
  await page.goto('http://localhost:8080/appointments', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'appointments-page.png' });
});
