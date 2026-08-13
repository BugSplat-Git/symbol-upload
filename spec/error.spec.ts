import { formatErrorChain } from '../src/error';

describe('formatErrorChain', () => {
  it('should return an empty string for a missing error', () => {
    expect(formatErrorChain(undefined)).toBe('');
  });

  it('should print a bare error message', () => {
    expect(formatErrorChain(new Error('boom'))).toBe('boom');
  });

  it('should walk error.cause when the inner error has a message', () => {
    const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:59999'), {
      code: 'ECONNREFUSED',
    });
    const error = new TypeError('fetch failed', { cause });

    expect(formatErrorChain(error)).toBe(
      'fetch failed\n  caused by ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:59999'
    );
  });

  it('should surface AggregateError.errors when the cause has an empty message', () => {
    // Node 22 dual-stack fetch: TypeError("fetch failed") -> AggregateError with
    // empty message, code copied from the first connect, syscall text on .errors.
    const v6 = Object.assign(new Error('connect ECONNREFUSED ::1:59999'), {
      code: 'ECONNREFUSED',
    });
    const v4 = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:59999'), {
      code: 'ECONNREFUSED',
    });
    const aggregate = Object.assign(new AggregateError([v6, v4]), {
      code: 'ECONNREFUSED',
    });
    const error = new TypeError('fetch failed', { cause: aggregate });

    expect(formatErrorChain(error)).toBe(
      [
        'fetch failed',
        'ECONNREFUSED',
        'ECONNREFUSED: connect ECONNREFUSED ::1:59999',
        'ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:59999',
      ].join('\n  caused by ')
    );
  });

  it('should include a code when the message is empty', () => {
    const error = Object.assign(new Error(''), { code: 'ETIMEDOUT' });

    expect(formatErrorChain(error)).toBe('ETIMEDOUT');
  });
});
