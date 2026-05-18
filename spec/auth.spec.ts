import { vi } from 'vitest';
import { validateOAuthCredentials } from '../src/auth';

describe('validateOAuthCredentials', () => {
    const host = 'https://app.bugsplat.com';

    function mockFetchReturning(status: number, body: unknown): typeof fetch {
        return vi.fn().mockResolvedValue({
            ok: status >= 200 && status < 300,
            status,
            json: async () => body,
        } as Response) as unknown as typeof fetch;
    }

    it('resolves when server returns an access_token', async () => {
        const fetchImpl = mockFetchReturning(200, { access_token: 'abc', token_type: 'Bearer' });

        await expect(validateOAuthCredentials('id', 'secret', host, fetchImpl)).resolves.toBeUndefined();
    });

    it('throws BugSplatAuthenticationError when server returns 400 with unknown clientId payload', async () => {
        const fetchImpl = mockFetchReturning(400, { message: 'Unknown clientId bad' });

        await expect(validateOAuthCredentials('bad', 'bad', host, fetchImpl)).rejects.toMatchObject({ isAuthenticationError: true });
    });

    it('throws BugSplatAuthenticationError when server returns 200 without access_token', async () => {
        const fetchImpl = mockFetchReturning(200, { error: 'invalid_client' });

        await expect(validateOAuthCredentials('bad', 'bad', host, fetchImpl)).rejects.toMatchObject({ isAuthenticationError: true });
    });

    it('throws BugSplatAuthenticationError when response body is not JSON', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => { throw new Error('not json'); },
        } as Response) as unknown as typeof fetch;

        await expect(validateOAuthCredentials('bad', 'bad', host, fetchImpl)).rejects.toMatchObject({ isAuthenticationError: true });
    });

    it('throws BugSplatAuthenticationError when fetch itself fails', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

        await expect(validateOAuthCredentials('id', 'secret', host, fetchImpl)).rejects.toMatchObject({ isAuthenticationError: true });
    });
});
