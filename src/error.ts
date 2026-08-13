// fetch() reports every transport failure as "fetch failed" and hangs the real
// reason off error.cause. Dual-stack (Happy Eyeballs) failures put that reason
// on an AggregateError with an empty message and the syscall text on .errors[].
export function formatErrorChain(error: unknown): string {
  const messages: string[] = [];
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();

  for (let i = 0; i < queue.length; i++) {
    const current = queue[i] as {
      message?: string;
      code?: string;
      cause?: unknown;
      errors?: unknown[];
    } | null;
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);

    const frame = formatErrorFrame(current);
    if (frame && !messages.includes(frame)) {
      messages.push(frame);
    }

    if (current.cause) {
      queue.push(current.cause);
    }
    if (Array.isArray(current.errors)) {
      queue.push(...current.errors);
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
  return `${error}`;
}
