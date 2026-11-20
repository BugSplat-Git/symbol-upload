import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { vi } from 'vitest';
import { safeRemoveTmp, tmpDir } from '../src/tmp';

const postSymbolsMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@bugsplat/js-api-client', () => ({
    SymbolsApiClient: class { postSymbols = postSymbolsMock; },
    VersionsApiClient: class { postSymbols = postSymbolsMock; },
}));

import { terminateWorkerPool, terminateWorkerPoolWhenIdle, uploadSymbolFiles } from '../src/upload';

describe('upload', () => {
    describe('terminateWorkerPool', () => {
        it('should resolve when the pool was never used', async () => {
            await expect(terminateWorkerPool()).resolves.toBeUndefined();
        });

        it('should not reject if the pool fails to terminate', async () => {
            const terminator = vi.fn().mockRejectedValue(new Error('Failed to terminate pool!'));
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});

            try {
                await expect(terminateWorkerPool(terminator)).resolves.toBeUndefined();

                expect(error).toHaveBeenCalled();
            } finally {
                error.mockRestore();
            }
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

    describe('terminateWorkerPoolWhenIdle', () => {
        const symbolFileInfo = {
            path: 'spec/support/windows.sym',
            dbgId: '9DD7CE5C705C45B09BEE297B84B5B9881c',
            moduleName: 'windows.pdb',
        };

        beforeEach(async () => await mkdir(tmpDir, { recursive: true }));

        it('should terminate the pool when no upload is in progress', async () => {
            const terminator = vi.fn().mockResolvedValue(undefined);

            await terminateWorkerPoolWhenIdle(terminator);

            expect(terminator).toHaveBeenCalledTimes(1);
        });

        // Terminating stops the compression workers an upload is using, and the caller goes on to
        // remove the temp folder its compressed files are in.
        it.each([
            ['succeeds', () => undefined],
            ['fails', () => { throw Object.assign(new Error('Not authorized'), { status: 403 }); }],
        ])('should not terminate the pool until an upload in progress %s', async (_, finish) => {
            let finishUpload = () => {};
            const uploading = new Promise<void>((resolve) => (finishUpload = resolve));
            const terminator = vi.fn().mockResolvedValue(undefined);
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});
            postSymbolsMock.mockClear();
            postSymbolsMock.mockImplementationOnce(() => uploading.then(finish));

            try {
                const upload = uploadSymbolFiles({} as never, 'db', 'app', '1.0', [symbolFileInfo]).catch(() => undefined);
                await vi.waitFor(() => expect(postSymbolsMock).toHaveBeenCalled());

                const terminated = terminateWorkerPoolWhenIdle(terminator);
                await new Promise((resolve) => setTimeout(resolve));

                expect(terminator).not.toHaveBeenCalled();

                finishUpload();
                await upload;
                await terminated;

                expect(terminator).toHaveBeenCalledTimes(1);
            } finally {
                finishUpload();
                error.mockRestore();
            }
        }, 30_000);

        // Terminating takes a while, and an upload that starts meanwhile is given new workers. The
        // caller removes the temp folder next, so that upload has to be waited for as well.
        it('should wait for an upload that starts while the pool is terminating, then terminate again', async () => {
            let finishUpload = () => {};
            let upload: Promise<void> | undefined;
            const uploading = new Promise<void>((resolve) => (finishUpload = resolve));
            const terminator = vi.fn().mockResolvedValue(undefined);
            postSymbolsMock.mockClear();
            postSymbolsMock.mockImplementationOnce(() => uploading);
            terminator.mockImplementationOnce(async () => {
                upload = uploadSymbolFiles({} as never, 'db', 'app', '1.0', [symbolFileInfo]);
            });

            try {
                const terminated = terminateWorkerPoolWhenIdle(terminator);
                await vi.waitFor(() => expect(postSymbolsMock).toHaveBeenCalled());

                expect(terminator).toHaveBeenCalledTimes(1);

                finishUpload();
                await upload;
                await terminated;

                expect(terminator).toHaveBeenCalledTimes(2);
            } finally {
                finishUpload();
            }
        }, 30_000);

        afterAll(async () => {
            await terminateWorkerPool();
            await safeRemoveTmp();
        });
    });
});
