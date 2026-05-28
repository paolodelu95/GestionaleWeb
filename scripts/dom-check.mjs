import { chromium } from 'playwright';

const r = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'bughunt@local.test', password: 'BugHunt2026!' }),
});
const { token } = await r.json();

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.goto('http://localhost:4200/');
await page.evaluate(t => localStorage.setItem('ordeva_token', t), token);
await page.goto('http://localhost:4200/pagamenti', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const html = await page.locator('.page-header').first().innerHTML();
console.log('=== .page-header innerHTML (first 800 chars) ===');
console.log(html.slice(0, 800));
console.log();

const css = await page.locator('.page-header').first().evaluate(el => {
  const styles = getComputedStyle(el);
  return {
    flexWrap: styles.flexWrap,
    children: Array.from(el.children).map(c => ({
      tag: c.tagName,
      classes: c.className,
      width: c.getBoundingClientRect().width,
      computedFlex: getComputedStyle(c).flex,
    })),
  };
});
console.log('=== children of .page-header ===');
console.log(JSON.stringify(css, null, 2));

await browser.close();
