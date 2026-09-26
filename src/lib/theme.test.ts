import assert from 'node:assert/strict';
import test from 'node:test';
import { isTheme, nextTheme } from './theme';

test('theme cycle covers dark, light and high contrast', () => {
  assert.equal(nextTheme('dark'), 'light');
  assert.equal(nextTheme('light'), 'contrast');
  assert.equal(nextTheme('contrast'), 'dark');
  assert.equal(isTheme('neon'), false);
});
