import { chromium } from 'playwright';

const r = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'bughunt@local.test', password: 'BugHunt2026!' }),
});
const { token } = await r.json();

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
await page.goto('http://localhost:4200/');
await page.evaluate(t => localStorage.setItem('ordeva_token', t), token);
await page.goto('http://localhost:4200/fatture', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.locator('button:has-text("Nuova fattura")').first().click();
await page.waitForTimeout(800);

const dlg = await page.locator('.cdk-overlay-pane').first().evaluate(el => {
  const r = el.getBoundingClientRect();
  const styles = getComputedStyle(el);
  return {
    width: r.width, height: r.height, left: r.left, top: r.top,
    inlineStyle: el.getAttribute('style'),
    computedWidth: styles.width,
    computedMaxWidth: styles.maxWidth,
  };
});
console.log('=== .cdk-overlay-pane ===');
console.log(JSON.stringify(dlg, null, 2));

const container = await page.locator('.mat-mdc-dialog-container').first().evaluate(el => {
  const r = el.getBoundingClientRect();
  const styles = getComputedStyle(el);
  return {
    width: r.width, height: r.height,
    computedWidth: styles.width,
    computedMaxWidth: styles.maxWidth,
  };
});
console.log('=== .mat-mdc-dialog-container ===');
console.log(JSON.stringify(container, null, 2));

await browser.close();
