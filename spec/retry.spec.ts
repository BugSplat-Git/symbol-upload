import { BugSplatApiError, BugSplatAuthenticationError, BugSplatRateLimitError } from '@bugsplat/js-api-client';
import { BrokenCircuitError } from 'cockatiel';
import { vi } from 'vitest';
import { createAuthRetryPolicy, createUploadRetryPolicy } from '../src/retry';

// Fast timings so retries/backoff resolve instantly in tests.
const fast = { maxAttempts: 3, initialDelay: 1, maxDelay: 1, halfOpenAfter: 1, rateLimitThreshold: 1 };

function apiError(message: string, status: number) {
    return new BugSplatApiError(message, status);
}

function rateLimitError() {
    return new BugSplatRateLimitError('too many requests');
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

describe('createAuthRetryPolicy', () => {
    it('should resolve a successful login without retrying', async () => {
        const policy = createAuthRetryPolicy(fast);
        const fn = vi.fn().mockResolvedValue('client');

        await expect(policy.execute(fn)).resolves.toBe('client');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry a rate limited login', async () => {
        const policy = createAuthRetryPolicy(fast);
        const fn = vi.fn().mockRejectedValue(rateLimitError());

        await expect(policy.execute(fn)).rejects.toThrow('too many requests');
        expect(fn).toHaveBeenCalledTimes(fast.maxAttempts + 1);
    });

    it('should recover when the rate limit clears', async () => {
        const policy = createAuthRetryPolicy(fast);
        const fn = vi.fn()
            .mockRejectedValueOnce(rateLimitError())
            .mockResolvedValue('client');

        await expect(policy.execute(fn)).resolves.toBe('client');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry bad credentials', async () => {
        const policy = createAuthRetryPolicy(fast);
        const fn = vi.fn().mockRejectedValue(new BugSplatAuthenticationError('bad credentials'));

        await expect(policy.execute(fn)).rejects.toThrow('bad credentials');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry an unknown client id', async () => {
        // The authorize endpoint answers an unknown client id with a 400, which no retry can fix.
        const policy = createAuthRetryPolicy(fast);
        const fn = vi.fn().mockRejectedValue(apiError('Unknown clientId', 400));

        await expect(policy.execute(fn)).rejects.toThrow('Unknown clientId');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry a gateway that answered with something other than json', async () => {
        const policy = createAuthRetryPolicy(fast);
        const fn = vi.fn().mockRejectedValue(apiError('not json', 502));

        await expect(policy.execute(fn)).rejects.toThrow('not json');
        expect(fn).toHaveBeenCalledTimes(fast.maxAttempts + 1);
    });

    it('should wait at least the Retry-After the server asked for', async () => {
        // Exponential backoff alone gives up inside a window the server already sized, so a 429 that
        // names its own delay has to raise the floor above the 1ms schedule these options ask for.
        // Assert the delay the policy reports rather than a wall-clock lower bound: setTimeout(50)
        // can fire a millisecond early, which is how Ubuntu CI failed this at 49ms.
        const policy = createAuthRetryPolicy({ ...fast, maxAttempts: 1 });
        const fn = vi.fn().mockRejectedValue(new BugSplatRateLimitError('too many requests', 429, 0.05));
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            await policy.execute(fn).catch(() => null);

            expect(error).toHaveBeenCalledWith(
                'Rate limited; backing off 50ms before retry...'
            );
            expect(fn).toHaveBeenCalledTimes(2);
        } finally {
            error.mockRestore();
        }
    });

    it('should cap an implausible Retry-After so it cannot stall a build', async () => {
        const policy = createAuthRetryPolicy({ ...fast, maxAttempts: 1, maxRetryAfterDelay: 20 });
        const fn = vi.fn().mockRejectedValue(new BugSplatRateLimitError('too many requests', 429, 86400));

        const started = Date.now();
        await policy.execute(fn).catch(() => null);

        expect(Date.now() - started).toBeLessThan(1000);
    });

    it('should keep backing off exponentially when the rate limit names no delay', async () => {
        const policy = createAuthRetryPolicy({ ...fast, maxAttempts: 2 });
        const fn = vi.fn().mockRejectedValue(rateLimitError());

        const started = Date.now();
        await policy.execute(fn).catch(() => null);

        // fast uses a 1ms schedule, so with no Retry-After to honor this stays effectively instant.
        expect(Date.now() - started).toBeLessThan(1000);
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should default to enough attempts to outlast a rate limit window', async () => {
        // Overrides only the delays so the default attempt count is what this pins.
        const policy = createAuthRetryPolicy({ initialDelay: 1, maxDelay: 1 });
        const fn = vi.fn().mockRejectedValue(rateLimitError());

        await policy.execute(fn).catch(() => null);

        expect(fn).toHaveBeenCalledTimes(7);
    });

    it('should not share a circuit breaker with uploads', async () => {
        // Uploads trip a breaker on 429 to coordinate parallel workers; a single sequential login has
        // nothing to coordinate, so a rate limited login must not fast-fail the next attempt.
        const policy = createAuthRetryPolicy(fast);
        await policy.execute(vi.fn().mockRejectedValue(rateLimitError())).catch(() => null);

        const next = vi.fn().mockResolvedValue('client');

        await expect(policy.execute(next)).resolves.toBe('client');
        expect(next).toHaveBeenCalledTimes(1);
    });
});
