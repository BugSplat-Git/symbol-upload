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
  try {
    return await OAuthClientCredentialsClient.createAuthenticatedClient(
      clientId,
      clientSecret,
      host
    );
  } catch (error) {
    // A non-JSON authorize response, a proxy error page for example, rejects inside login().
    if (error instanceof SyntaxError) {
      throw new BugSplatAuthenticationError(
        `Could not authenticate, check credentials and try again: ${error.message}`
      );
    }

    throw error;
  }
}
