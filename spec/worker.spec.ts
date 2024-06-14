import { BugSplatAuthenticationError, SymbolsApiClient, VersionsApiClient } from '@bugsplat/js-api-client';
import { availableParallelism } from 'node:os';
import retryPromise from 'promise-retry';
import { WorkerPool } from 'workerpool';
import { SymbolFileInfo } from '../src/info';
import { UploadWorker, createWorkersFromSymbolFiles } from '../src/worker';

const workerCount = availableParallelism();

describe('worker', () => {
    let symbolsClient: jasmine.SpyObj<SymbolsApiClient>;
    let versionsClient: jasmine.SpyObj<VersionsApiClient>;
    let clients: [SymbolsApiClient, VersionsApiClient];

    beforeEach(() => {
        symbolsClient = jasmine.createSpyObj<SymbolsApiClient>('SymbolsApiClient', ['postSymbols']);
        versionsClient = jasmine.createSpyObj<VersionsApiClient>('VersionsApiClient', ['postSymbols']);
        symbolsClient.postSymbols.and.resolveTo();
        versionsClient.postSymbols.and.resolveTo();
        clients = [symbolsClient, versionsClient];
    });

    describe('createWorkersFromSymbolFiles', () => {
        it('should create max workers if symbol files exceeds worker count', () => {
            const workerPool = createFakeWorkerPool();
            const symbolFiles = createFakeSymbolFileInfos(workerCount + 1);

            const workers = createWorkersFromSymbolFiles(workerPool, workerCount, symbolFiles, clients);

            expect(workers.length).toEqual(workerCount);
        });

        it('should create equal worker count to symbol files', () => {
            const symbolFiles = createFakeSymbolFileInfos(workerCount);
            const workerPool = createFakeWorkerPool();

            const workers = createWorkersFromSymbolFiles(workerPool, workerCount, symbolFiles, clients);

            expect(workers.length).toEqual(workerCount);
        });

        it('should spread symbol files evenly across workers', () => {
            const symbolFiles = createFakeSymbolFileInfos(workerCount * 2);
            const workerPool = createFakeWorkerPool();

            const workers = createWorkersFromSymbolFiles(workerPool, workerCount, symbolFiles, clients);
            const worker1SymbolFiles = workers[0].symbolFileInfos;
            const worker2SymbolFiles = workers[1].symbolFileInfos;

            expect(worker1SymbolFiles.length).toEqual(Math.ceil(symbolFiles.length / workerCount));
            expect(worker2SymbolFiles.length).toEqual(Math.floor(symbolFiles.length / workerCount));
        });
    });

    describe('upload', () => {
        const database = 'database';
        const application = 'application';
        const version = 'version';

        describe('legacy', () => {
            let symbolFileInfos;

            beforeEach(async () => {
                symbolFileInfos = createFakeSymbolFileInfos(2).map((info) => ({ ...info, dbgId: undefined }));
                const worker = createUploadWorkerWithFakeReadStream(1, symbolFileInfos, clients);
                await worker.upload(database, application, version);
            });

            it('should call versionsClient.postSymbols with database, application, version, and symbol files', () => {
                const symbolFiles = symbolFileInfos.map(symbolFile => ({
                    name: `${symbolFile.path}.zip`,
                    dbgId: symbolFile.dbgId,
                    moduleName: symbolFile.moduleName,
                    size: 0,
                    uncompressedSize: 0,
                    lastModified: 0,
                    file: jasmine.stringContaining('.zip'),
                }));
                expect(versionsClient.postSymbols).toHaveBeenCalledWith(database, application, version, jasmine.arrayContaining([symbolFiles[0]]));
                expect(versionsClient.postSymbols).toHaveBeenCalledWith(database, application, version, jasmine.arrayContaining([symbolFiles[1]]));
            });

            it('should call versionsClient.postSymbols for each symbol file', () => {
                expect(versionsClient.postSymbols).toHaveBeenCalledTimes(symbolFileInfos.length);
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
                    file: jasmine.stringContaining('.gz'),
                }));
                expect(symbolsClient.postSymbols).toHaveBeenCalledWith(database, application, version, jasmine.arrayContaining([symbolFiles[0]]));
                expect(symbolsClient.postSymbols).toHaveBeenCalledWith(database, application, version, jasmine.arrayContaining([symbolFiles[1]]));
            });

            it('should call symbolsClient.postSymbols for each symbol file', () => {
                expect(symbolsClient.postSymbols).toHaveBeenCalledTimes(symbolFileInfos.length);
            });
        });

        it('should retry failed uploads', async () => {
            const retries = 3;
            const retrier = (func) => retryPromise(func, { retries, minTimeout: 0, maxTimeout: 0, factor: 1 });
            const symbolFiles = createFakeSymbolFileInfos(1);
            const workerPool = createFakeWorkerPool();
            symbolsClient.postSymbols.and.callFake(() => Promise.reject(new Error('Failed to upload!')));
            const worker = new UploadWorker(1, symbolFiles, workerPool, ...clients);
            (worker as any).retryPromise = retrier;
            (worker as any).stat = () => Promise.resolve({ size: 0, mtime: 0 });

            await worker.upload(database, application, version).catch(() => null);

            expect(symbolsClient.postSymbols).toHaveBeenCalledTimes(retries * symbolFiles.length + 1);
        });

        it('should destroy file stream on error', async () => {
            const readStream = jasmine.createSpyObj('ReadStream', ['destroy']);
            const retrier = (func) => retryPromise(func, { retries: 0 });
            const symbolFiles = createFakeSymbolFileInfos(1);
            const workerPool = createFakeWorkerPool();
            const worker = new UploadWorker(1, symbolFiles, workerPool, ...clients);
            symbolsClient.postSymbols.and.rejectWith(new Error('Failed to upload!'));
            (worker as any).createReadStream = () => readStream;
            (worker as any).retryPromise = retrier;
            (worker as any).stat = () => Promise.resolve({ size: 0, mtime: 0 });
            (worker as any).toWeb = () => readStream;

            await worker.upload(database, application, version).catch(() => null);

            expect(readStream.destroy).toHaveBeenCalled();
        });

        describe('error', () => {
            it('should not retry authentication errors', async () => {
                const retry = jasmine.createSpy();
                const retrier = (func) => func(retry);
                const symbolFiles = createFakeSymbolFileInfos(1);
                const workerPool = createFakeWorkerPool();
                symbolsClient.postSymbols.and.callFake(() => Promise.reject(new BugSplatAuthenticationError('Failed to upload!')));
                const worker = new UploadWorker(1, symbolFiles, workerPool, ...clients);
                (worker as any).retryPromise = retrier;
                (worker as any).stat = () => Promise.resolve({ size: 0, mtime: 0 });
    
                await worker.upload(database, application, version).catch(() => null);
    
                expect(retry).not.toHaveBeenCalled();
            });

            it('should not retry max size errors', async () => {
                const retry = jasmine.createSpy();
                const retrier = (func) => func(retry);
                const symbolFiles = createFakeSymbolFileInfos(1);
                const workerPool = createFakeWorkerPool();
                symbolsClient.postSymbols.and.callFake(() => Promise.reject(new Error('Symbol file max size exceeded!')));
                const worker = new UploadWorker(1, symbolFiles, workerPool, ...clients);
                (worker as any).retryPromise = retrier;
                (worker as any).stat = () => Promise.resolve({ size: 0, mtime: 0 });
    
                await worker.upload(database, application, version).catch(() => null);
    
                expect(retry).not.toHaveBeenCalled();
            });
        })
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

function createFakeWorkerPool(): jasmine.SpyObj<WorkerPool> {
    const fakeWorkerPool = jasmine.createSpyObj('WorkerPool', ['exec']);
    fakeWorkerPool.exec.and.resolveTo();
    return fakeWorkerPool;
}

function createUploadWorkerWithFakeReadStream(id: number, symbolFileInfos: any[], clients: [SymbolsApiClient, VersionsApiClient]) {
    const workerPool = createFakeWorkerPool();
    const worker = new UploadWorker(id, symbolFileInfos, workerPool, ...clients);
    (worker as any).stat = jasmine.createSpy().and.resolveTo({ size: 0, mtime: 0 });
    (worker as any).createReadStream = jasmine.createSpy().and.callFake(file => file);
    (worker as any).toWeb = jasmine.createSpy().and.callFake(file => file);
    return worker;
}