// fetch() reports every transport failure as "fetch failed" and hangs the real
// reason off error.cause. Dual-stack (Happy Eyeballs) failures put that reason
// on an AggregateError with an empty message and the syscall text on .errors[].
export function formatErrorChain(error: unknown): string {
  const messages: string[] = [];
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();

  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current == null || seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (typeof current !== 'object') {
      const frame = String(current);
      if (frame && !messages.includes(frame)) {
        messages.push(frame);
      }
      continue;
    }

    const err = current as {
      message?: string;
      code?: string;
      cause?: unknown;
      errors?: unknown[];
    };

    const frame = formatErrorFrame(err);
    if (frame && !messages.includes(frame)) {
      messages.push(frame);
    }

    if (err.cause != null) {
      queue.push(err.cause);
    }
    if (Array.isArray(err.errors)) {
      queue.push(...err.errors);
    }
  }

  return messages.join('\n  caused by ');
}

function formatErrorFrame(error: {
  message?: string;
  code?: string;
}): string {
  const message = error.message ?? '';
  const code = error.code;

  if (message && code) {
    return `${code}: ${message}`;
  }
  if (message) {
    return message;
  }
  if (code) {
    return String(code);
  }
  return '';
}
