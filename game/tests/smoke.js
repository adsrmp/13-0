// Smoke test for 13–0 after a data update.
// Usage: node game/tests/smoke.js http://127.0.0.1:8000/ [eventId ...]
// Serve the public/ folder first, e.g.  python3 -m http.server 8000 -d public
// Checks: the page loads with no script errors, every listed event shows up in the Events view,
// a classic draft can be completed and played, the gauntlet runs, and the daily draft opens.
const { chromium } = require('playwright');

(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8000/';
  const want = process.argv.slice(3);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { localStorage.setItem('thirteen-nick', '"SmokeTest"'); localStorage.setItem('thirteen-timer', 'false'); });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const fail = msg => { console.log('FAIL:', msg); process.exitCode = 1; };

  await p.goto(url); await p.waitForTimeout(1200);
  // events view
  await p.goto(url + '#events'); await p.waitForTimeout(400);
  const scopes = await p.$$eval('[data-evscope]', els => els.map(e => e.dataset.evscope));
  const ids = [];
  for (const sc of scopes.length ? scopes : [null]) {
    if (sc) { await p.click(`[data-evscope="${sc}"]`); await p.waitForTimeout(150); }
    ids.push(...await p.$$eval('[data-ev]', els => els.map(e => e.dataset.ev)));
  }
  console.log('events in the app:', ids.length);
  for (const id of want) if (!ids.includes(id)) fail('event not shown: ' + id);

  const draft = async () => {
    for (let i = 0; i < 40; i++) {
      if (await p.$('#playgo')) return true;
      const btn = await p.$('[data-pick] .pright');
      if (btn) await btn.click(); else { const sk = await p.$('#skip'); if (sk) await sk.click(); }
      await p.waitForTimeout(60);
    }
    return !!await p.$('#playgo');
  };
  for (const mode of ['classic', 'gauntlet']) {
    await p.goto(url + '#play'); await p.waitForTimeout(300);
    const hub = await p.$('#tohub'); if (hub) { await hub.click(); await p.waitForTimeout(200); }
    await p.click(`[data-start="${mode}"]`); await p.waitForTimeout(200);
    if (!await draft()) { fail(mode + ': could not finish the draft'); continue; }
    await p.click('#playgo'); await p.waitForTimeout(1500);
    const res = await p.$('#match');
    if (!res) fail(mode + ': no result'); else console.log(mode + ':', (await res.textContent()).replace(/\s+/g, ' ').slice(0, 60));
    if (!await p.$('#sheet .mstats')) fail(mode + ': stats pop-up did not open');
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);   // close the stats pop-up
  }
  await p.click('#tohub'); await p.waitForTimeout(200);
  await p.click('[data-daily]'); await p.waitForTimeout(300);
  if (!await p.$('[data-pick]')) fail('daily draft has no players to pick');
  else console.log('daily: opens');
  // each regional/tier 2 deal filter deals something
  await p.click('#tohub'); await p.waitForTimeout(200);
  const opts = await p.$$eval('#ft option', o => o.map(x => x.value));
  for (const v of opts) {
    await p.selectOption('#ft', v); await p.click('[data-start="classic"]'); await p.waitForTimeout(200);
    if (!await p.$('[data-pick]')) fail('deal filter "' + v + '" deals nothing');
    await p.click('#tohub'); await p.waitForTimeout(150);
  }
  await p.selectOption('#ft', '');
  if (errs.length) fail('page errors: ' + errs.join(' | '));
  console.log(process.exitCode ? 'SMOKE TEST FAILED' : 'SMOKE TEST PASSED');
  await b.close();
})();
