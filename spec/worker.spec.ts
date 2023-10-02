import { VersionsApiClient } from '@bugsplat/js-api-client';
import { UploadWorker, createWorkersFromSymbolFiles } from '../bin/worker';
import retryPromise from 'promise-retry';

describe('worker', () => {
    describe('createWorkersFromSymbolFiles', () => {
        it('should create max workers if symbol files exceeds worker count', () => {
            const symbolFiles = [1, 2] as any[];
            const workerCount = 1;

            const workers = createWorkersFromSymbolFiles({} as any, symbolFiles, workerCount);

            expect(workers.length).toEqual(workerCount);
        });

        it('should create equal worker count to symbol files', () => {
            const symbolFiles = [1, 2] as any[];
            const workerCount = 2;

            const workers = createWorkersFromSymbolFiles({} as any, symbolFiles, workerCount);

            expect(workers.length).toEqual(workerCount);
        });

        it('should spread symbol files evenly across workers', () => {
            const symbolFiles = [1, 2, 3, 4, 5].map(createFakeSymbolFileInfo);
            const workerCount = 2;

            const workers = createWorkersFromSymbolFiles({} as any, symbolFiles, workerCount);
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
        let versionsClient: jasmine.SpyObj<VersionsApiClient>;

        beforeEach(() => {
            versionsClient = jasmine.createSpyObj<VersionsApiClient>('VersionsApiClient', ['postSymbols']);
            versionsClient.postSymbols.and.resolveTo();
        });

        it('should call versionsClient.postSymbols with database, application, version, and symbol files', async () => {
            const symbolFiles = [1, 2].map(createFakeSymbolFileInfo);
            const worker = createUploadWorkerWithFakeReadStream(1, versionsClient, symbolFiles);

            await worker.upload(database, application, version);

            expect(versionsClient.postSymbols).toHaveBeenCalledWith(database, application, version, [symbolFiles[0]]);
            expect(versionsClient.postSymbols).toHaveBeenCalledWith(database, application, version, [symbolFiles[1]]);
        });

        it('should call versionsClient.postSymbols for each symbol file', async () => {
            const symbolFiles = [1, 2].map(createFakeSymbolFileInfo);
            const worker = createUploadWorkerWithFakeReadStream(1, versionsClient, symbolFiles);

            await worker.upload(database, application, version);

            expect(versionsClient.postSymbols).toHaveBeenCalledTimes(symbolFiles.length);
        });

        it('should retry failed uploads', async () => {
            const retries = 3;
            const retrier = (func) => retryPromise(func, { retries, minTimeout: 0, maxTimeout: 0, factor: 1 });
            const symbolFiles = [1].map(createFakeSymbolFileInfo);
            const uploadSingle = jasmine.createSpy().and.callFake(() => Promise.reject(new Error('Failed to upload!')));
            const worker = new UploadWorker(1, symbolFiles, versionsClient);
            (worker as any).uploadSingle = uploadSingle;
            (worker as any).retryPromise = retrier;

            await worker.upload(database, application, version).catch(() => null);

            expect(uploadSingle).toHaveBeenCalledTimes(retries * symbolFiles.length + 1);
        });

        it('should destroy file stream on error', async () => {
            const readStream = jasmine.createSpyObj('ReadStream', ['destroy']);
            const retrier = (func) => retryPromise(func, { retries: 0 });
            const symbolFiles = [1].map(createFakeSymbolFileInfo);
            const worker = new UploadWorker(1, symbolFiles, versionsClient);
            versionsClient.postSymbols.and.rejectWith(new Error('Failed to upload!'));
            (worker as any).createReadStream = () => readStream;
            (worker as any).retryPromise = retrier;

            await worker.upload(database, application, version).catch(() => null);

            expect(readStream.destroy).toHaveBeenCalled();
        });
    });
});

function createFakeSymbolFileInfo(path: any) {
    return {
        name: path,
        file: path,
        size: 0
    };
}

function createUploadWorkerWithFakeReadStream(id: number, versionsClient: VersionsApiClient, symbolFileInfos: any[]) {
    const worker = new UploadWorker(id, symbolFileInfos, versionsClient);
    (worker as any).createReadStream = jasmine.createSpy().and.callFake(file => file);
    return worker;
}