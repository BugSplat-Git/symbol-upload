import { SymbolsApiClient, VersionsApiClient } from '@bugsplat/js-api-client';
import { IPolicy } from 'cockatiel';
import { availableParallelism } from 'node:os';
import { WorkerPool } from 'workerpool';
import { vi } from 'vitest';
import { SymbolFileInfo } from '../src/info';
import { UploadWorker, createWorkersFromSymbolFiles } from '../src/worker';

const workerCount = availableParallelism();

describe('worker', () => {
    let symbolsClient: SymbolsApiClient;
    let versionsClient: VersionsApiClient;
    let clients: [SymbolsApiClient, VersionsApiClient];

    beforeEach(() => {
        symbolsClient = {
            postSymbols: vi.fn().mockResolvedValue(undefined),
        } as unknown as SymbolsApiClient;
        versionsClient = {
            postSymbols: vi.fn().mockResolvedValue(undefined),
        } as unknown as VersionsApiClient;
        clients = [symbolsClient, versionsClient];
    });

    describe('createWorkersFromSymbolFiles', () => {
        it('should create max workers if symbol files exceeds worker count', () => {
            const workerPool = createFakeWorkerPool();
            const symbolFiles = createFakeSymbolFileInfos(workerCount + 1);

            const workers = createWorkersFromSymbolFiles(workerPool, workerCount, symbolFiles, clients);

            expect(workers.length).toBe(workerCount);
        });

        it('should create equal worker count to symbol files', () => {
            const symbolFiles = createFakeSymbolFileInfos(workerCount);
            const workerPool = createFakeWorkerPool();

            const workers = createWorkersFromSymbolFiles(workerPool, workerCount, symbolFiles, clients);

            expect(workers.length).toBe(workerCount);
        });

        it('should spread symbol files evenly across workers', () => {
            const symbolFiles = createFakeSymbolFileInfos(workerCount * 2);
            const workerPool = createFakeWorkerPool();

            const workers = createWorkersFromSymbolFiles(workerPool, workerCount, symbolFiles, clients);
            const worker1SymbolFiles = workers[0].symbolFileInfos;
            const worker2SymbolFiles = workers[1].symbolFileInfos;

            expect(worker1SymbolFiles.length).toBe(Math.ceil(symbolFiles.length / workerCount));
            expect(worker2SymbolFiles.length).toBe(Math.floor(symbolFiles.length / workerCount));
        });
    });

    describe('upload', () => {
        const database = 'database';
        const application = 'application';
        const version = 'version';

        describe('skip', () => {
            it('should skip files with no dbgId', async () => {
                const symbolFileInfos = createFakeSymbolFileInfos(2).map((info) => ({ ...info, dbgId: '' }));
                const worker = createUploadWorkerWithFakeReadStream(1, symbolFileInfos, clients);
                const results = await worker.upload(database, application, version);

                expect(symbolsClient.postSymbols).not.toHaveBeenCalled();
                expect(versionsClient.postSymbols).not.toHaveBeenCalled();
                expect(results.every(r => r.size === 0)).toBe(true);
            });
        });

        describe('legacy', () => {
            it('should use versionsClient for .sym files without dbgId', async () => {
                const symbolFileInfos = [
                    createFakeSymbolFileInfo({ path: 'crashpad.sym', moduleName: 'crashpad.sym', dbgId: '' }),
                ];
                const worker = createUploadWorkerWithFakeReadStream(1, symbolFileInfos, clients);
                await worker.upload(database, application, version);

                expect(versionsClient.postSymbols).toHaveBeenCalledTimes(1);
                expect(symbolsClient.postSymbols).not.toHaveBeenCalled();
            });

            it('should use versionsClient for source maps without dbgId', async () => {
                const symbolFileInfos = [
                    createFakeSymbolFileInfo({ path: 'app.js.map', moduleName: 'app.js.map', dbgId: '' }),
                ];
                const worker = createUploadWorkerWithFakeReadStream(1, symbolFileInfos, clients);
                await worker.upload(database, application, version);

                expect(versionsClient.postSymbols).toHaveBeenCalledTimes(1);
                expect(symbolsClient.postSymbols).not.toHaveBeenCalled();
            });

            it('should zip Unity LineNumberMappings.json and use versionsClient', async () => {
                const symbolFileInfos = [
                    createFakeSymbolFileInfo({ path: 'LineNumberMappings.json', moduleName: 'LineNumberMappings.json', dbgId: '' }),
                ];
                const worker = createUploadWorkerWithFakeReadStream(1, symbolFileInfos, clients);
                await worker.upload(database, application, version);

                expect(versionsClient.postSymbols).toHaveBeenCalledWith(database, application, version, [
                    expect.objectContaining({ name: 'LineNumberMappings.json.zip' }),
                ]);
                expect(symbolsClient.postSymbols).not.toHaveBeenCalled();
            });

            it('should upload a differently cased linenumbermappings.json as LineNumberMappings.json.zip', async () => {
                const symbolFileInfos = [
                    createFakeSymbolFileInfo({ path: 'linenumbermappings.json', moduleName: 'linenumbermappings.json', dbgId: '' }),
                ];
                const worker = createUploadWorkerWithFakeReadStream(1, symbolFileInfos, clients);
                await worker.upload(database, application, version);

                expect(versionsClient.postSymbols).toHaveBeenCalledWith(database, application, version, [
                    expect.objectContaining({ name: 'LineNumberMappings.json.zip' }),
                ]);
            });

            it('should still skip other .json files without dbgId', async () => {
                const symbolFileInfos = [
                    createFakeSymbolFileInfo({ path: 'package.json', moduleName: 'package.json', dbgId: '' }),
                ];
                const worker = createUploadWorkerWithFakeReadStream(1, symbolFileInfos, clients);
                await worker.upload(database, application, version);

                expect(versionsClient.postSymbols).not.toHaveBeenCalled();
                expect(symbolsClient.postSymbols).not.toHaveBeenCalled();
            });

            it('should name the zip entry LineNumberMappings.json for LineNumberMappings.json', async () => {
                const path = 'Build/LineNumberMappings.json';
                const workerPool = createFakeWorkerPool();
                const worker = createUploadWorkerWithFakeReadStream(1, [
                    createFakeSymbolFileInfo({ path, moduleName: 'LineNumberMappings.json', dbgId: '' }),
                ], clients, createFakePolicy(), workerPool);
                await worker.upload(database, application, version);

                expect(workerPool.exec).toHaveBeenCalledWith('createZipFile', [path, expect.stringContaining('.zip'), 'LineNumberMappings.json']);
            });

            it('should name the zip entry LineNumberMappings.json for a differently cased linenumbermappings.json', async () => {
                const path = 'Build/linenumbermappings.json';
                const workerPool = createFakeWorkerPool();
                const worker = createUploadWorkerWithFakeReadStream(1, [
                    createFakeSymbolFileInfo({ path, moduleName: 'linenumbermappings.json', dbgId: '' }),
                ], clients, createFakePolicy(), workerPool);
                await worker.upload(database, application, version);

                expect(workerPool.exec).toHaveBeenCalledWith('createZipFile', [path, expect.stringContaining('.zip'), 'LineNumberMappings.json']);
            });

            describe.each(['macos', 'ios', 'android'])('Unity LineNumberMappings-%s.json', (platform) => {
                const fileName = `LineNumberMappings-${platform}.json`;
                const path = `Build/${fileName}`;
                let workerPool: WorkerPool;

                beforeEach(async () => {
                    workerPool = createFakeWorkerPool();
                    const worker = createUploadWorkerWithFakeReadStream(1, [
                        createFakeSymbolFileInfo({ path, moduleName: fileName, dbgId: '' }),
                    ], clients, createFakePolicy(), workerPool);
                    await worker.upload(database, application, version);
                });

                it(`should upload as ${fileName}.zip through versionsClient`, () => {
                    expect(versionsClient.postSymbols).toHaveBeenCalledWith(database, application, version, [
                        expect.objectContaining({ name: `${fileName}.zip` }),
                    ]);
                    expect(symbolsClient.postSymbols).not.toHaveBeenCalled();
                });

                it(`should name the zip entry ${fileName}`, () => {
                    expect(workerPool.exec).toHaveBeenCalledWith('createZipFile', [path, expect.stringContaining('.zip'), fileName]);
                });
            });

            it.each([
                ['linenumbermappings-IOS.json', 'LineNumberMappings-ios.json'],
                ['LINENUMBERMAPPINGS-MacOS.JSON', 'LineNumberMappings-macos.json'],
                ['lineNumberMappings-Android.json', 'LineNumberMappings-android.json'],
                ['LineNumberMappings-xbox_series.json', 'LineNumberMappings-xbox_series.json'],
            ])('should normalize %s to %s for the upload name and zip entry', async (fileName, expected) => {
                const path = `Build/${fileName}`;
                const workerPool = createFakeWorkerPool();
                const worker = createUploadWorkerWithFakeReadStream(1, [
                    createFakeSymbolFileInfo({ path, moduleName: fileName, dbgId: '' }),
                ], clients, createFakePolicy(), workerPool);
                await worker.upload(database, application, version);

                expect(versionsClient.postSymbols).toHaveBeenCalledWith(database, application, version, [
                    expect.objectContaining({ name: `${expected}.zip` }),
                ]);
                expect(workerPool.exec).toHaveBeenCalledWith('createZipFile', [path, expect.stringContaining('.zip'), expected]);
            });

            it.each([
                'LineNumberMappings-foo bar.json',
                'LineNumberMappings-.json',
                'LineNumberMappings-ios.json.bak',
                'LineNumberMappings-ios-arm64.json',
                'MyLineNumberMappings.json',
                'LineNumberMappings.txt',
                'other.json',
            ])('should still skip %s without dbgId', async (fileName) => {
                const symbolFileInfos = [
                    createFakeSymbolFileInfo({ path: fileName, moduleName: fileName, dbgId: '' }),
                ];
                const worker = createUploadWorkerWithFakeReadStream(1, symbolFileInfos, clients);
                const results = await worker.upload(database, application, version);

                expect(versionsClient.postSymbols).not.toHaveBeenCalled();
                expect(symbolsClient.postSymbols).not.toHaveBeenCalled();
                expect(results).toEqual([{ name: fileName, size: 0 }]);
            });

            it('should keep the original zip entry name for source maps', async () => {
                const path = 'dist/app.js.map';
                const workerPool = createFakeWorkerPool();
                const worker = createUploadWorkerWithFakeReadStream(1, [
                    createFakeSymbolFileInfo({ path, moduleName: 'app.js.map', dbgId: '' }),
                ], clients, createFakePolicy(), workerPool);
                await worker.upload(database, application, version);

                expect(workerPool.exec).toHaveBeenCalledWith('createZipFile', [path, expect.stringContaining('.zip'), 'app.js.map']);
                expect(versionsClient.postSymbols).toHaveBeenCalledWith(database, application, version, [
                    expect.objectContaining({ name: 'app.js.map.zip' }),
                ]);
            });
        });

        describe('symsrv', () => {
            let symbolFileInfos;

            beforeEach(async () => {
                symbolFileInfos = createFakeSymbolFileInfos(2);
                const worker = createUploadWorkerWithFakeReadStream(1, symbolFileInfos, clients);
                await worker.upload(database, application, version);
            });

            it('should call symbolsClient.postSymbols with database, application, version, and symbol files', () => {
                const symbolFiles = symbolFileInfos.map(symbolFile => ({
                    name: symbolFile.path,
                    dbgId: symbolFile.dbgId,
                    moduleName: symbolFile.moduleName,
                    size: 0,
                    uncompressedSize: 0,
                    lastModified: 0,
                    file: expect.stringContaining('.gz'),
                }));
                expect(symbolsClient.postSymbols).toHaveBeenCalledWith(database, application, version, expect.arrayContaining([symbolFiles[0]]));
                expect(symbolsClient.postSymbols).toHaveBeenCalledWith(database, application, version, expect.arrayContaining([symbolFiles[1]]));
            });

            it('should call symbolsClient.postSymbols for each symbol file', () => {
                expect(symbolsClient.postSymbols).toHaveBeenCalledTimes(symbolFileInfos.length);
            });
        });

        it('should run each upload through the retry policy', async () => {
            const retryPolicy = createFakePolicy();
            const symbolFiles = createFakeSymbolFileInfos(2);
            const worker = createUploadWorkerWithFakeReadStream(1, symbolFiles, clients, retryPolicy);

            await worker.upload(database, application, version);

            expect(retryPolicy.execute).toHaveBeenCalledTimes(symbolFiles.length);
        });

        it('should destroy file stream on error', async () => {
            const readStream = {
                destroy: vi.fn(),
            };
            const symbolFiles = createFakeSymbolFileInfos(1);
            const worker = createUploadWorkerWithFakeReadStream(1, symbolFiles, clients);
            vi.mocked(symbolsClient.postSymbols).mockRejectedValue(new Error('Failed to upload!'));
            (worker as any).createReadStream = () => readStream;
            (worker as any).toWeb = () => readStream;

            await worker.upload(database, application, version).catch(() => null);

            expect(readStream.destroy).toHaveBeenCalled();
        });
    });
});

function createFakeSymbolFileInfos(count: number) {
    return Array.from(Array(count).keys())
        .map((i) => createFakeSymbolFileInfo({
            path: `path${i}`,
            moduleName: `moduleName${i}`,
            dbgId: `dbgId${i}`
        })
        );
}

function createFakeSymbolFileInfo(params: Partial<SymbolFileInfo>): SymbolFileInfo {
    const defaults = {
        path: 'path',
        moduleName: 'moduleName',
        dbgId: 'dbgId',
    };
    return {
        ...defaults,
        ...params
    };
}

function createFakeWorkerPool(): WorkerPool {
    const fakeWorkerPool = {
        exec: vi.fn().mockResolvedValue(undefined),
    } as unknown as WorkerPool;
    return fakeWorkerPool;
}

function createUploadWorkerWithFakeReadStream(id: number, symbolFileInfos: any[], clients: [SymbolsApiClient, VersionsApiClient], retryPolicy = createFakePolicy(), workerPool = createFakeWorkerPool()) {
    const worker = new UploadWorker(id, symbolFileInfos, workerPool, ...clients, retryPolicy);
    (worker as any).stat = vi.fn().mockResolvedValue({ size: 0, mtime: 0 });
    (worker as any).createReadStream = vi.fn().mockImplementation(file => file);
    (worker as any).toWeb = vi.fn().mockImplementation(file => file);
    return worker;
}

// A pass-through policy that runs the attempt exactly once. Retry/backoff/breaker behavior is
// covered in retry.spec.ts; here we only care that the worker hands each upload to the policy.
function createFakePolicy(): IPolicy {
    return {
        execute: vi.fn().mockImplementation((fn) => fn({ attempt: 0, signal: new AbortController().signal })),
    } as unknown as IPolicy;
}