import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { vi } from 'vitest';
import { safeRemoveTmp, tmpDir } from '../src/tmp';

const postSymbolsMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@bugsplat/js-api-client', () => ({
    SymbolsApiClient: class { postSymbols = postSymbolsMock; },
    VersionsApiClient: class { postSymbols = postSymbolsMock; },
}));

import { terminateWorkerPool, uploadSymbolFiles } from '../src/upload';

describe('upload', () => {
    describe('terminateWorkerPool', () => {
        it('should resolve when the pool was never used', async () => {
            await expect(terminateWorkerPool()).resolves.toBeUndefined();
        });

        it('should not reject if the pool fails to terminate', async () => {
            const terminator = vi.fn().mockRejectedValue(new Error('Failed to terminate pool!'));
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(terminateWorkerPool(terminator)).resolves.toBeUndefined();

            expect(error).toHaveBeenCalled();
            error.mockRestore();
        });

        // The pool only spawns workers once a task runs, and a spawned worker holds a MessagePort
        // that keeps the event loop alive. Terminating after real work is what lets the CLI exit.
        it('should release workers spawned by an upload', async () => {
            if (!existsSync(tmpDir)) {
                await mkdir(tmpDir, { recursive: true });
            }

            await uploadSymbolFiles({} as never, 'db', 'app', '1.0', [
                {
                    path: 'spec/support/windows.sym',
                    dbgId: '9DD7CE5C705C45B09BEE297B84B5B9881c',
                    moduleName: 'windows.pdb',
                },
            ]);

            expect(postSymbolsMock).toHaveBeenCalled();
            expect(process.getActiveResourcesInfo()).toContain('MessagePort');

            await expect(terminateWorkerPool()).resolves.toBeUndefined();

            expect(process.getActiveResourcesInfo()).not.toContain('MessagePort');
        }, 30_000);

        afterAll(async () => await safeRemoveTmp());
    });
});
