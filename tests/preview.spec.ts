import { test, expect } from '@grafana/plugin-e2e';
import type { Page } from '@playwright/test';

// The preview slider must only affect the panel editor. Viewers always get the schedule, whatever
// the slider was left at and whatever an older plugin version saved into the dashboard JSON.

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const DAY = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const base = {
  image: { kind: 'dataUrl', src: PIXEL, mime: 'image/png' },
  mode: 'blur',
  modeSettings: {},
  easing: 'linear',
  timeSource: 'browser',
  showCountdown: true,
  animateBeforeReveal: false,
};

function panel(id: number, title: string, options: Record<string, unknown>) {
  return {
    id,
    title,
    type: 'sparkanswers-reveal-panel',
    gridPos: { x: ((id - 1) % 3) * 8, y: 0, w: 8, h: 8 },
    options: { ...base, ...options },
  };
}

async function saveDashboard(page: Page, uid: string, panels: unknown[]) {
  const res = await page.request.post('/api/dashboards/db', {
    data: { dashboard: { uid, title: `e2e ${uid}`, panels, schemaVersion: 39 }, overwrite: true },
  });
  expect(res.ok()).toBeTruthy();
}

const section = (page: Page, title: string) =>
  page.locator(`section[data-testid="data-testid Panel header ${title}"]`);

test('preview set in the editor does not follow the panel back to the dashboard', async ({
  gotoPanelEditPage,
  selectors,
  page,
}) => {
  const uid = 'e2e-preview-editor';
  await saveDashboard(page, uid, [panel(1, 'Halfway', { startDate: iso(-10 * DAY), revealDate: iso(10 * DAY) })]);

  const editPage = await gotoPanelEditPage({ dashboard: { uid }, id: '1' });
  await expect(editPage.panel.locator).toContainText('50% revealed');

  const handle = page.getByRole('slider', { name: 'Preview progress' });
  await handle.focus();
  await handle.press('End');
  await expect(editPage.panel.locator).toContainText('Revealed');
  await expect(editPage.panel.locator).not.toContainText('50% revealed');

  // In-app navigation (no reload), so any leaked in-memory or unsaved state would still be there.
  await editPage
    .getByGrafanaSelector(selectors.components.NavToolbar.editDashboard.backToDashboardButton)
    .click();
  await expect(page).not.toHaveURL(/editPanel/);
  await expect(section(page, 'Halfway')).toContainText('50% revealed');
});

test('a preview saved by 1.0.0 is ignored: schedule, expiry and hidden periods win', async ({
  gotoDashboardPage,
  page,
}) => {
  const uid = 'e2e-preview-legacy';
  // Shown for 1 s per hour, half an hour away from now: hidden for the whole test.
  const offset = `${(new Date().getUTCMinutes() + 30) % 60}m`;
  await saveDashboard(page, uid, [
    panel(1, 'Scheduled', { startDate: iso(-10 * DAY), revealDate: iso(10 * DAY), previewOverride: 100 }),
    panel(2, 'Expired', {
      startDate: iso(-20 * DAY),
      revealDate: iso(-10 * DAY),
      expireDate: iso(-DAY),
      previewOverride: 100,
    }),
    panel(3, 'Repeating', {
      repeat: { enabled: true, every: '1h', showFor: '1s', align: 'clock', offset },
      previewOverride: 100,
    }),
  ]);

  await gotoDashboardPage({ uid });
  await expect(section(page, 'Scheduled')).toContainText('50% revealed');
  await expect(section(page, 'Expired').getByTestId('reveal-expired')).toBeVisible();
  await expect(section(page, 'Repeating').getByTestId('reveal-hidden')).toHaveCount(1);
  await expect(section(page, 'Repeating').locator('img')).toHaveCount(0);
});
