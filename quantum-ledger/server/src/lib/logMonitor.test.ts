import assert from 'node:assert/strict';
import { splitCompleteLines } from './logMonitor';

// Complete lines consumed, blanks dropped, byte count = up to and including last '\n'.
{
  const { lines, consumedBytes } = splitCompleteLines('a\n\nb\n');
  assert.deepEqual(lines, ['a', 'b']);
  assert.equal(consumedBytes, 5); // 'a\n\nb\n'
}

// Unterminated trailing line is held back (not parsed, not counted).
{
  const { lines, consumedBytes } = splitCompleteLines('done\nhalf-writ');
  assert.deepEqual(lines, ['done']);
  assert.equal(consumedBytes, 5); // 'done\n'
}

// Nothing complete yet → consume nothing.
{
  const { lines, consumedBytes } = splitCompleteLines('no newline yet');
  assert.deepEqual(lines, []);
  assert.equal(consumedBytes, 0);
}

console.log('logMonitor splitCompleteLines: ok');
