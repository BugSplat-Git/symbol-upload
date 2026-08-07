import {
  BugSplatAuthenticationError,
  OAuthClientCredentialsClient,
} from '@bugsplat/js-api-client';

export interface AuthenticationArgs {
  clientId: string;
  clientSecret: string;
}

export async function createBugSplatClient(
  { clientId, clientSecret }: AuthenticationArgs,
  host: string | undefined = process.env.BUGSPLAT_HOST
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
