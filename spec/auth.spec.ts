import { OAuthClientCredentialsClient } from '@bugsplat/js-api-client';
import { vi } from 'vitest';
import { createBugSplatClient } from '../src/auth';
import { createAuthRetryPolicy } from '../src/retry';

describe('createBugSplatClient', () => {
  const host = 'https://app.bugsplat.com';
  const oauthArgs = {
    clientId: '🎫',
    clientSecret: '🔐',
  };

  // Retries are exercised on their own below; everywhere else they would only slow the suite down.
  const noRetry = () => createAuthRetryPolicy({ maxAttempts: 0 });
  // maxRetryAfterDelay caps the Retry-After the stub sends, which is otherwise honored as a real 60s wait.
  const fastRetry = () =>
    createAuthRetryPolicy({
      maxAttempts: 2,
      initialDelay: 1,
      maxDelay: 1,
      maxRetryAfterDelay: 1,
    });

  afterEach(() => vi.unstubAllGlobals());

  describe('oauth', () => {
    it('should return an authenticated client when an access token is returned', async () => {
      stubFetch(
        jsonResponse(200, { token_type: 'Bearer', access_token: '🪙' })
      );

      const client = await createBugSplatClient(oauthArgs, host, noRetry());

      expect(client).toBeInstanceOf(OAuthClientCredentialsClient);
    });

    it('should throw for an unknown client id', async () => {
      stubFetch(jsonResponse(400, { message: 'Unknown clientId 🎫' }));

      await expect(
        createBugSplatClient(oauthArgs, host, noRetry())
      ).rejects.toThrow(/Unknown clientId/);
    });

    it('should throw an authentication error when no access token is returned', async () => {
      stubFetch(jsonResponse(400, { message: 'Unknown clientId 🎫' }));

      const error = await createBugSplatClient(
        oauthArgs,
        host,
        noRetry()
      ).catch((error) => error);

      expect(error.isAuthenticationError).toBe(true);
    });

    it('should throw for an invalid client secret', async () => {
      stubFetch(
        jsonResponse(200, {
          error: 'invalid_client',
          error_description: 'Client authentication failed',
        })
      );

      const error = await createBugSplatClient(
        oauthArgs,
        host,
        noRetry()
      ).catch((error) => error);

      expect(error.message).toBe(
        'Could not authenticate, check credentials and try again'
      );
    });

    it('should throw with the response status when the response has no error details', async () => {
      stubFetch(jsonResponse(400, {}));

      await expect(
        createBugSplatClient(oauthArgs, host, noRetry())
      ).rejects.toThrow(/status 400/);
    });

    it('should throw when the response is not json', async () => {
      stubFetch(new Response('<html>500</html>', { status: 500 }));

      await expect(
        createBugSplatClient(oauthArgs, host, noRetry())
      ).rejects.toThrow(/Could not authenticate/);
    });

    it('should name the status and body when the response is not json', async () => {
      // A bare "Unexpected end of JSON input" named neither the endpoint nor the status, so a rate
      // limited build step read as bad credentials.
      stubFetch(new Response('<html>Bad Gateway</html>', { status: 502 }));

      const error = await createBugSplatClient(
        oauthArgs,
        host,
        noRetry()
      ).catch((error) => error);

      expect(error.status).toBe(502);
      expect(error.message).toContain('status 502');
      expect(error.message).toContain('<html>Bad Gateway</html>');
    });

    it('should rethrow network errors instead of blaming credentials', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('fetch failed'))
      );

      await expect(
        createBugSplatClient(oauthArgs, host, noRetry())
      ).rejects.toThrow('fetch failed');
    });

    describe('rate limiting', () => {
      const rateLimited = () =>
        new Response('', {
          status: 429,
          headers: { 'retry-after': '60' },
        });

      it('should report a rate limit rather than an empty json body', async () => {
        stubFetch(rateLimited());

        const error = await createBugSplatClient(
          oauthArgs,
          host,
          noRetry()
        ).catch((error) => error);

        expect(error.isRateLimitError).toBe(true);
        expect(error.message).toBe(
          'Could not authenticate, too many requests, retry after 60 seconds'
        );
      });

      it('should not report a rate limit as an authentication failure', async () => {
        // isAuthenticationError is treated as permanent, which would stop the retry below.
        stubFetch(rateLimited());

        const error = await createBugSplatClient(
          oauthArgs,
          host,
          noRetry()
        ).catch((error) => error);

        expect(error.isAuthenticationError).toBeUndefined();
      });

      it('should retry a rate limited login', async () => {
        const fetch = stubFetch(rateLimited());

        await createBugSplatClient(oauthArgs, host, fastRetry()).catch(
          () => null
        );

        expect(fetch).toHaveBeenCalledTimes(3);
      });

      it('should authenticate once the rate limit clears', async () => {
        const fetch = vi
          .fn()
          .mockResolvedValueOnce(rateLimited())
          .mockResolvedValue(
            jsonResponse(200, { token_type: 'Bearer', access_token: '🪙' })
          );
        vi.stubGlobal('fetch', fetch);

        const client = await createBugSplatClient(
          oauthArgs,
          host,
          fastRetry()
        );

        expect(client).toBeInstanceOf(OAuthClientCredentialsClient);
        expect(fetch).toHaveBeenCalledTimes(2);
      });

      it('should not retry credentials the server rejected', async () => {
        const fetch = stubFetch(
          jsonResponse(400, { message: 'Unknown clientId 🎫' })
        );

        await createBugSplatClient(oauthArgs, host, fastRetry()).catch(
          () => null
        );

        expect(fetch).toHaveBeenCalledTimes(1);
      });
    });
  });
});

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(response: Response) {
  const fetch = vi.fn().mockImplementation(async () => response.clone());
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
