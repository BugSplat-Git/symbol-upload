import {
  ApiClient,
  BugSplatApiClient,
  OAuthClientCredentialsClient,
} from '@bugsplat/js-api-client';
import { IPolicy } from 'cockatiel';
import { createAuthRetryPolicy } from './retry';

export interface AuthenticationArgs {
  user: string;
  password: string;
  clientId: string;
  clientSecret: string;
}

export async function createBugSplatClient(
  { user, password, clientId, clientSecret }: AuthenticationArgs,
  host: string | undefined = process.env.BUGSPLAT_HOST,
  retryPolicy: IPolicy = createAuthRetryPolicy()
): Promise<ApiClient> {
  return retryPolicy.execute((): Promise<ApiClient> => {
    if (user && password) {
      return BugSplatApiClient.createAuthenticatedClientForNode(
        user,
        password,
        host
      );
    }

    return OAuthClientCredentialsClient.createAuthenticatedClient(
      clientId,
      clientSecret,
      host
    );
  });
}
