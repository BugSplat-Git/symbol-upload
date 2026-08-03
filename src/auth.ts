import {
  ApiClient,
  BugSplatApiClient,
  BugSplatAuthenticationError,
  OAuthClientCredentialsClient,
} from '@bugsplat/js-api-client';

export interface AuthenticationArgs {
  user: string;
  password: string;
  clientId: string;
  clientSecret: string;
}

export async function createBugSplatClient(
  { user, password, clientId, clientSecret }: AuthenticationArgs,
  host: string | undefined = process.env.BUGSPLAT_HOST
): Promise<ApiClient> {
  if (user && password) {
    return BugSplatApiClient.createAuthenticatedClientForNode(
      user,
      password,
      host
    );
  }

  return createAuthenticatedOAuthClient(clientId, clientSecret, host);
}

async function createAuthenticatedOAuthClient(
  clientId: string,
  clientSecret: string,
  host: string | undefined
): Promise<OAuthClientCredentialsClient> {
  const client = new OAuthClientCredentialsClient(clientId, clientSecret, host);
  const response = await login(client);
  const json = (await response
    .json()
    .catch(() => null)) as OAuthLoginResult | null;

  // The authorize endpoint answers unknown client ids with an error payload instead of an
  // access_token, which would otherwise fail later with a confusing 401 in the middle of an upload.
  // json() re-reads a clone of the authorize response; if that ever stops working, trust login()
  // rather than reject an authentication that succeeded.
  if (json && !json.access_token) {
    const detail =
      json.error_description ??
      json.message ??
      json.error ??
      `status ${response.status}`;
    throw new BugSplatAuthenticationError(
      createAuthenticationErrorMessage(detail)
    );
  }

  return client;
}

async function login(client: OAuthClientCredentialsClient) {
  try {
    return await client.login();
  } catch (error) {
    // A non-JSON authorize response, a proxy error page for example, rejects inside login().
    if (error instanceof SyntaxError) {
      throw new BugSplatAuthenticationError(
        createAuthenticationErrorMessage(error.message)
      );
    }

    throw error;
  }
}

function createAuthenticationErrorMessage(detail: string): string {
  return `Could not authenticate, check credentials and try again: ${detail}`;
}

type OAuthLoginResult = {
  access_token?: string;
  error?: string;
  error_description?: string;
  message?: string;
};
