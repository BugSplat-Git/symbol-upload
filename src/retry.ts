import { BugSplatApiError, BugSplatAuthenticationError } from '@bugsplat/js-api-client';
import {
    BrokenCircuitError,
    ConsecutiveBreaker,
    ExponentialBackoff,
    IPolicy,
    circuitBreaker,
    handleWhen,
    retry,
    wrap,
} from 'cockatiel';

export interface RetryPolicyOptions {
    /** Number of retries before giving up on a single upload. */
    maxAttempts?: number;
    /** Initial retry backoff in milliseconds. */
    initialDelay?: number;
    /** Maximum retry backoff in milliseconds. */
    maxDelay?: number;
    /** How long the breaker stays open after a 429 before testing a single request, in milliseconds. */
    halfOpenAfter?: number;
    /** Number of consecutive 429s that trips the breaker. */
    rateLimitThreshold?: number;
}

export function isRateLimitError(error: unknown): boolean {
    return (error as BugSplatApiError | null)?.status === 429;
}

export function isAuthenticationError(error: unknown): boolean {
    return !!(error as BugSplatAuthenticationError | null)?.isAuthenticationError;
}

export function isMaxSizeExceededError(error: unknown): boolean {
    const message = (error as Error | null)?.message ?? '';
    return message.includes('Symbol file max size') || message.includes('Symbol table max size');
}

/**
 * A 4xx means the request itself is the problem — wrong database, a client with the `restricted` scope,
 * a file the server won't take — so resending it earns the same rejection. 408 and 429 are the
 * exceptions: both clear on their own, and 429 additionally drives the circuit breaker below.
 */
export function hasPermanentStatus(error: unknown): boolean {
    const status = (error as BugSplatApiError | null)?.status;
    return !!status && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

// Permanent failures are worth failing fast on; retrying them just wastes requests against the rate limit.
function isPermanent(error: unknown): boolean {
    return hasPermanentStatus(error) || isAuthenticationError(error) || isMaxSizeExceededError(error);
}

/**
 * Builds the shared retry policy for symbol uploads. A single instance must be shared across every
 * worker so the circuit breaker can coordinate them: because all workers upload from the same IP,
 * one 429 trips the breaker and the rest fast-fail (and back off) instead of each burning its own
 * request to rediscover the limit.
 *
 *   wrap(retry, breaker):
 *   - breaker (inner) trips only on 429s, so rate limiting — and nothing else — pauses every worker.
 *   - retry (outer) applies exponential backoff with decorrelated jitter to any transient failure,
 *     including a 429 or a BrokenCircuitError from the open breaker, but never to permanent errors.
 */
export function createUploadRetryPolicy(options: RetryPolicyOptions = {}): IPolicy {
    const {
        maxAttempts = 15,
        initialDelay = 1000,
        maxDelay = 30000,
        halfOpenAfter = 10000,
        rateLimitThreshold = 1,
    } = options;

    const retryPolicy = retry(handleWhen(error => !isPermanent(error)), {
        maxAttempts,
        backoff: new ExponentialBackoff({ initialDelay, maxDelay }),
    });

    const breakerPolicy = circuitBreaker(handleWhen(isRateLimitError), {
        halfOpenAfter,
        breaker: new ConsecutiveBreaker(rateLimitThreshold),
    });

    retryPolicy.onRetry(reason => {
        const error = 'error' in reason ? reason.error : undefined;
        const rateLimited = error instanceof BrokenCircuitError || isRateLimitError(error);
        const what = rateLimited ? 'Rate limited' : 'Upload request failed';
        console.error(`${what}; backing off ${Math.round(reason.delay)}ms before retry...`);
    });
    breakerPolicy.onBreak(() => console.error('Rate limit hit (429) — pausing all symbol uploads...'));
    breakerPolicy.onReset(() => console.log('Rate limit cleared — resuming symbol uploads.'));

    return wrap(retryPolicy, breakerPolicy);
}

/**
 * Builds the retry policy for authentication. A build that uploads symbols in more than one step can
 * exhaust the rate limit in the first step and then be turned away at /oauth2/authorize in the second,
 * which fails the whole step over a limit that clears on its own.
 *
 * No circuit breaker here: login is a single sequential request with no sibling workers to coordinate,
 * and permanent failures — bad credentials, an unknown client id — still fail on the first attempt.
 */
export function createAuthRetryPolicy(
    options: Pick<RetryPolicyOptions, 'maxAttempts' | 'initialDelay' | 'maxDelay'> = {}
): IPolicy {
    const { maxAttempts = 5, initialDelay = 1000, maxDelay = 30000 } = options;

    const retryPolicy = retry(handleWhen(error => !isPermanent(error)), {
        maxAttempts,
        backoff: new ExponentialBackoff({ initialDelay, maxDelay }),
    });

    retryPolicy.onRetry(reason => {
        const error = 'error' in reason ? reason.error : undefined;
        const what = isRateLimitError(error) ? 'Rate limited' : 'Authentication request failed';
        console.error(`${what}; backing off ${Math.round(reason.delay)}ms before retry...`);
    });

    return retryPolicy;
}
