import { OAuthClientCredentialsClient } from '@bugsplat/js-api-client';
import { IPolicy } from 'cockatiel';
import { createAuthRetryPolicy } from './retry';

export const defaultHost = 'https://api.bugsplat.com';

export interface AuthenticationArgs {
  clientId: string;
  clientSecret: string;
}

export async function createBugSplatClient(
  { clientId, clientSecret }: AuthenticationArgs,
  host: string = process.env.BUGSPLAT_HOST ?? defaultHost,
  retryPolicy: IPolicy = createAuthRetryPolicy()
): Promise<OAuthClientCredentialsClient> {
  return retryPolicy.execute((): Promise<OAuthClientCredentialsClient> => {
    return OAuthClientCredentialsClient.createAuthenticatedClient(
      clientId,
      clientSecret,
      host
    );
  });
}
