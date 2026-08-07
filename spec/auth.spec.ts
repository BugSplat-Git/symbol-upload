import {
  BugSplatApiClient,
  OAuthClientCredentialsClient,
} from '@bugsplat/js-api-client';
import { vi } from 'vitest';
import { createBugSplatClient } from '../src/auth';

describe('createBugSplatClient', () => {
  const host = 'https://app.bugsplat.com';
  const oauthArgs = {
    user: '',
    password: '',
    clientId: '🎫',
    clientSecret: '🔐',
  };

  afterEach(() => vi.unstubAllGlobals());

  describe('oauth', () => {
    it('should return an authenticated client when an access token is returned', async () => {
      stubFetch(
        jsonResponse(200, { token_type: 'Bearer', access_token: '🪙' })
      );

      const client = await createBugSplatClient(oauthArgs, host);

      expect(client).toBeInstanceOf(OAuthClientCredentialsClient);
    });

    it('should throw for an unknown client id', async () => {
      stubFetch(jsonResponse(400, { message: 'Unknown clientId 🎫' }));

      await expect(createBugSplatClient(oauthArgs, host)).rejects.toThrow(
        /Unknown clientId/
      );
    });

    it('should throw an authentication error when no access token is returned', async () => {
      stubFetch(jsonResponse(400, { message: 'Unknown clientId 🎫' }));

      const error = await createBugSplatClient(oauthArgs, host).catch(
        (error) => error
      );

      expect(error.isAuthenticationError).toBe(true);
    });

    it('should throw for an invalid client secret', async () => {
      stubFetch(
        jsonResponse(200, {
          error: 'invalid_client',
          error_description: 'Client authentication failed',
        })
      );

      const error = await createBugSplatClient(oauthArgs, host).catch(
        (error) => error
      );

      expect(error.message).toBe(
        'Could not authenticate, check credentials and try again'
      );
    });

    it('should throw with the response status when the response has no error details', async () => {
      stubFetch(jsonResponse(400, {}));

      await expect(createBugSplatClient(oauthArgs, host)).rejects.toThrow(
        /status 400/
      );
    });

    it('should throw when the response is not json', async () => {
      stubFetch(new Response('<html>500</html>', { status: 500 }));

      await expect(createBugSplatClient(oauthArgs, host)).rejects.toThrow(
        /Could not authenticate/
      );
    });

    it('should rethrow network errors instead of blaming credentials', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('fetch failed'))
      );

      await expect(createBugSplatClient(oauthArgs, host)).rejects.toThrow(
        'fetch failed'
      );
    });
  });

  describe('user and password', () => {
    const userArgs = {
      user: '🧑',
      password: '🔑',
      clientId: '',
      clientSecret: '',
    };

    it('should return an authenticated client', async () => {
      stubFetch(
        new Response('{}', {
          status: 200,
          headers: { 'set-cookie': 'xsrf-token=token; path=/' },
        })
      );

      const client = await createBugSplatClient(userArgs, host);

      expect(client).toBeInstanceOf(BugSplatApiClient);
    });

    it('should throw for invalid credentials', async () => {
      stubFetch(jsonResponse(401, { message: 'Authentication failure' }));

      await expect(createBugSplatClient(userArgs, host)).rejects.toThrow(
        /Could not authenticate/
      );
    });
  });
});

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(response: Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => response.clone())
  );
}
