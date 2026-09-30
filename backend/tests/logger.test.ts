import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/common/utils/logger';

describe('createLogger', () => {
  it('redacts secrets from log output', () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const logger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'info' }, destination);

    logger.info(
      { password: 'hunter2', body: { token: 'abc123', newPassword: 'n3w!' }, username: 'juan' },
      'login attempt',
    );

    const output = lines.join('');
    expect(output).toContain('juan');
    expect(output).not.toContain('hunter2');
    expect(output).not.toContain('abc123');
    expect(output).not.toContain('n3w!');
    expect(output).toContain('[REDACTED]');
  });
});
