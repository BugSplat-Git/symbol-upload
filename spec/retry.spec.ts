import { BugSplatAuthenticationError } from '@bugsplat/js-api-client';
import { BrokenCircuitError } from 'cockatiel';
import { vi } from 'vitest';
import { createUploadRetryPolicy } from '../src/retry';

// Fast timings so retries/backoff resolve instantly in tests.
const fast = { maxAttempts: 3, initialDelay: 1, maxDelay: 1, halfOpenAfter: 1, rateLimitThreshold: 1 };

// Shape of a BugSplatApiError: an Error carrying the response status.
function apiError(message: string, status: number) {
    return Object.assign(new Error(message), { status });
}

function rateLimitError() {
    return apiError('too many requests', 429);
}

describe('createUploadRetryPolicy', () => {
    it('should resolve a successful call without retrying', async () => {
        const policy = createUploadRetryPolicy(fast);
        const fn = vi.fn().mockResolvedValue('ok');

        await expect(policy.execute(fn)).resolves.toBe('ok');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry transient errors up to maxAttempts times', async () => {
        const policy = createUploadRetryPolicy(fast);
        const fn = vi.fn().mockRejectedValue(new Error('network blip'));

        await expect(policy.execute(fn)).rejects.toThrow('network blip');
        // maxAttempts is the retry count, so the function runs maxAttempts + 1 times.
        expect(fn).toHaveBeenCalledTimes(fast.maxAttempts + 1);
    });

    it('should not retry authentication errors', async () => {
        const policy = createUploadRetryPolicy(fast);
        const fn = vi.fn().mockRejectedValue(new BugSplatAuthenticationError('bad credentials'));

        await expect(policy.execute(fn)).rejects.toThrow('bad credentials');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it.each([400, 403, 404, 413])('should not retry %i, the request itself is the problem', async (status) => {
        const policy = createUploadRetryPolicy(fast);
        const fn = vi.fn().mockRejectedValue(apiError('rejected', status));

        await expect(policy.execute(fn)).rejects.toThrow('rejected');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it.each([408, 500, 502, 503])('should retry %i, which can clear on its own', async (status) => {
        const policy = createUploadRetryPolicy(fast);
        const fn = vi.fn().mockRejectedValue(apiError('transient', status));

        await expect(policy.execute(fn)).rejects.toThrow('transient');
        expect(fn).toHaveBeenCalledTimes(fast.maxAttempts + 1);
    });

    // Bridge for client versions predating the typed BugSplatApiError; remove with isUntypedForbiddenError.
    it('should not retry the legacy untyped 403 error carrying no status', async () => {
        const policy = createUploadRetryPolicy(fast);
        const fn = vi.fn().mockRejectedValue(new Error('Error getting presigned URL, invalid credentials'));

        await expect(policy.execute(fn)).rejects.toThrow('invalid credentials');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry max size errors', async () => {
        const policy = createUploadRetryPolicy(fast);
        const fn = vi.fn().mockRejectedValue(new Error('Symbol file max size exceeded'));

        await expect(policy.execute(fn)).rejects.toThrow('Symbol file max size');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should trip the breaker on a 429 so subsequent calls fast-fail without hitting the network', async () => {
        // Keep the breaker open long enough that the second call sees it open.
        const policy = createUploadRetryPolicy({ ...fast, halfOpenAfter: 60000 });
        const failing = vi.fn().mockRejectedValue(rateLimitError());

        await policy.execute(failing).catch(() => null);

        // The first 429 trips the breaker (inner policy), so the retries that follow fast-fail with
        // BrokenCircuitError instead of hitting the network again — only the initial attempt does.
        expect(failing).toHaveBeenCalledTimes(1);

        const next = vi.fn().mockResolvedValue('ok');
        await expect(policy.execute(next)).rejects.toBeInstanceOf(BrokenCircuitError);
        expect(next).not.toHaveBeenCalled();
    });

    it('should not trip the breaker on non-429 errors', async () => {
        const policy = createUploadRetryPolicy({ ...fast, halfOpenAfter: 60000 });
        const failing = vi.fn().mockRejectedValue(new Error('network blip'));

        await policy.execute(failing).catch(() => null);

        // Breaker only trips on 429s, so the next call still reaches the function.
        const next = vi.fn().mockResolvedValue('ok');
        await expect(policy.execute(next)).resolves.toBe('ok');
        expect(next).toHaveBeenCalledTimes(1);
    });
});
