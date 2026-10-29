'use strict';
// Render every theme of the procedural soundtrack offline and check levels.
//   node tools/music-check.js [seconds] [theme,theme,...]
// For each theme (and the boss variants) AudioSys.renderTheme() renders the
// score into an OfflineAudioContext; this prints peak, RMS, note events, the
// longest silence and any score lint, and ends with "music OK" when every
// theme passes. Needs playwright + chromium.
const { chromium } = require('playwright');
const path = require('path');
const seconds = parseFloat(process.argv[2]) || 24;
const only = process.argv[3] ? process.argv[3].split(',') : null;
const THEMES = ['title', 'shore', 'rust', 'hours', 'tower', 'archive', 'mills', 'root', 'boss', 'boss_regent', 'boss_sef', 'ending'];
const BUSY = { shore: 1, rust: 1, hours: 0, tower: 1, mills: 1, boss: 1, boss_regent: 1, boss_sef: 1, ending: 1, title: 0, archive: 0, root: 0 };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html') + '?debug');
  await page.waitForTimeout(400);
  const rows = [];
  let ok = true;
  for (const name of THEMES) {
    if (only && only.indexOf(name) < 0) continue;
    let r;
    try {
      r = await page.evaluate(async ({ name, seconds }) => {
        const res = await AudioSys.renderTheme(name, seconds);
        const buf = res.buffer, n = buf.length, sr = buf.sampleRate;
        const L = buf.getChannelData(0), R = buf.getChannelData(1);
        let peak = 0, sum = 0;
        for (let i = 0; i < n; i++) { const a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > peak) peak = a; if (b > peak) peak = b; sum += (L[i] * L[i] + R[i] * R[i]) * 0.5; }
        const rms = Math.sqrt(sum / n);
        // longest run of 50 ms windows below -50 dBFS, after the first 0.5 s
        const win = Math.floor(sr * 0.05); let run = 0, longest = 0;
        for (let s = Math.floor(sr * 0.5); s + win <= n; s += win) {
          let e = 0; for (let i = s; i < s + win; i++) e += L[i] * L[i] + R[i] * R[i];
          const w = Math.sqrt(e / (2 * win));
          if (w < 0.003) { run++; if (run > longest) longest = run; } else run = 0;
        }
        // crude spectral balance: zero crossings per second of the left channel
        let zc = 0; for (let i = 1; i < n; i++) if ((L[i] >= 0) !== (L[i - 1] >= 0)) zc++;
        // clipped samples
        let clip = 0; for (let i = 0; i < n; i++) if (Math.abs(L[i]) >= 0.999 || Math.abs(R[i]) >= 0.999) clip++;
        return { peak, rms, silence: longest * 0.05, events: res.events, lint: res.lint, length: res.length, zcps: zc / (n / sr), clip };
      }, { name, seconds });
    } catch (e) { r = { error: e.message }; }
    const minEvents = BUSY[name] ? 150 : 40;
    const maxSilence = name === 'archive' ? 99 : 4;
    const pass = !r.error && r.peak < 0.98 && r.clip === 0 && r.rms >= 0.03 && r.rms <= 0.25 && r.events > minEvents * seconds / 24 && r.silence <= maxSilence && (!r.lint || r.lint.length === 0);
    if (!pass) ok = false;
    rows.push({ name, ...r, pass });
  }
  const pad = (s, n, right) => { s = String(s); return right ? s.padStart(n) : s.padEnd(n); };
  console.log(pad('theme', 12) + pad('peak', 7, 1) + pad('rms', 7, 1) + pad('events', 8, 1) + pad('silence', 9, 1) + pad('pass(s)', 9, 1) + pad('zc/s', 7, 1) + '  result');
  for (const r of rows) {
    if (r.error) { console.log(pad(r.name, 12) + '  ERROR ' + r.error); continue; }
    console.log(pad(r.name, 12) + pad(r.peak.toFixed(3), 7, 1) + pad(r.rms.toFixed(3), 7, 1) + pad(r.events, 8, 1) + pad(r.silence.toFixed(2), 9, 1) + pad(r.length.toFixed(1), 9, 1) + pad(Math.round(r.zcps), 7, 1) + '  ' + (r.pass ? 'ok' : 'FAIL') + (r.lint && r.lint.length ? '  lint: ' + r.lint.join('; ') : ''));
  }
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
  if (errors.length) ok = false;
  console.log(ok ? 'music OK' : 'music FAILED');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
