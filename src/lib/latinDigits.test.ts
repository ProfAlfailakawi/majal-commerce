import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/*
 * Every number the site shows is written with Latin digits (0-9). Two things break that:
 * Arabic-Indic digits typed into a string, and Arabic locales formatting a number or date without
 * the `nu-latn` numbering system (ar-EG and plain ar-KW default to Arabic-Indic digits). This guard
 * walks the source so a new string or locale cannot quietly bring them back.
 */

// The server's input normaliser has to *recognise* Arabic-Indic digits to convert them.
const ALLOWED = new Set(['server/ai-intelligence.ts']);
const ARABIC_INDIC = /[٠-٩۰-۹٪٫٬]/;
// Only formatting calls: a language setting such as `lang: 'ar'` is not a number format.
const ARABIC_LOCALE = /(?:toLocale\w*|Intl\.\w+)\(\s*['"`]ar[A-Za-z0-9-]*['"`]/g;

function sourceFiles(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (name !== 'node_modules') sourceFiles(path, out); continue; }
    if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

const files = [...sourceFiles('src'), ...sourceFiles('server'), 'server.ts'].filter(f => !ALLOWED.has(f));

test('no Arabic-Indic digits or separators in application source', () => {
  const found: string[] = [];
  for (const file of files) readFileSync(file, 'utf8').split('\n').forEach((line, i) => { if (ARABIC_INDIC.test(line)) found.push(`${file}:${i + 1}: ${line.trim().slice(0, 100)}`); });
  assert.deepEqual(found, [], `Use 0-9, %, . and , instead:\n${found.join('\n')}`);
});

test('every Arabic locale used for formatting pins the Latin numbering system', () => {
  const found: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(ARABIC_LOCALE)) {
      if (!match[0].includes('-u-nu-latn')) {
        const line = text.slice(0, match.index).split('\n').length;
        found.push(`${file}:${line}: ${match[0]}`);
      }
    }
  }
  assert.deepEqual(found, [], `Add -u-nu-latn to these locales:\n${found.join('\n')}`);
});

test('the formatters the site relies on really produce Latin digits', () => {
  const sample = new Date('2026-10-18T11:05:09Z');
  const out = [
    (1234567.5).toLocaleString('ar-KW-u-nu-latn'),
    sample.toLocaleDateString('ar-KW-u-nu-latn'),
    sample.toLocaleTimeString('ar-KW-u-nu-latn'),
    new Intl.DateTimeFormat('ar-KW-u-nu-latn', { timeZone: 'Asia/Kuwait', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(sample),
  ].join(' ');
  assert.ok(!ARABIC_INDIC.test(out), out);
  assert.match(out, /1,234,567\.5/);
});
