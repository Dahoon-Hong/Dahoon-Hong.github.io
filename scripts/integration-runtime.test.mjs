import { describe, expect, it } from 'vitest';
import { parseArgs, validatePort } from './integration-runtime.mjs';

describe('integration runtime launcher', () => {
  it('parses an explicit runtime contract', () => {
    expect(parseArgs([
      'start',
      '--worktree', 'C:/worktrees/plan-test',
      '--port', '5183',
      '--runtime-id', 'plan-8-run-1',
    ])).toEqual({
      command: 'start',
      options: {
        worktree: 'C:/worktrees/plan-test',
        port: '5183',
        'runtime-id': 'plan-8-run-1',
      },
    });
  });

  it('rejects invalid or missing ports', () => {
    expect(() => validatePort('0')).toThrow('1 to 65535');
    expect(() => validatePort('5183.5')).toThrow('1 to 65535');
    expect(() => parseArgs(['start', '--port'])).toThrow('missing value');
  });
});
