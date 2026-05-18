import { BugSplatAuthenticationError } from '@bugsplat/js-api-client';

// The OAuth library only treats HTTP 401 or a JSON body containing
// `error: 'invalid_client'` as an auth failure. The server now returns
// HTTP 400 with `{ message: 'Unknown clientId ...' }` for bad credentials,
// which slips past those checks and yields a client with no access token —
// leaving every upload to fail in a retry loop. Validate explicitly so we
// exit immediately with a clear error.
export async function validateOAuthCredentials(
  clientId: string,
  clientSecret: string,
  host: string = 'https://app.bugsplat.com',
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const url = new URL('/oauth2/authorize', host).href;
  const body = new FormData();
  body.append('grant_type', 'client_credentials');
  body.append('client_id', clientId);
  body.append('client_secret', clientSecret);

  let response: Response;
  try {
    response = await fetchImpl(url, { method: 'POST', body });
  } catch (cause) {
    throw new BugSplatAuthenticationError(
      `Could not reach ${url} to authenticate: ${(cause as Error).message}`
    );
  }

  let payload: { access_token?: string } | null = null;
  try {
    payload = (await response.json()) as { access_token?: string };
  } catch {
    // empty/non-JSON body is treated as auth failure below
  }

  if (!response.ok || !payload?.access_token) {
    throw new BugSplatAuthenticationError(
      'Could not authenticate, check clientId and clientSecret and try again'
    );
  }
}
