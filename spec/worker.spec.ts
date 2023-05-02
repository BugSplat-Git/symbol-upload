import { VersionsApiClient } from '@bugsplat/js-api-client';
import { UploadWorker, createWorkersFromSymbolFiles } from '../bin/worker';

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
            const symbolFiles = [1, 2, 3, 4, 5] as any[];
            const workerCount = 2;

            const workers = createWorkersFromSymbolFiles({} as any, symbolFiles, workerCount);
            const worker1SymbolFiles = (workers[0] as any).symbolFiles;
            const worker2SymbolFiles = (workers[1] as any).symbolFiles;

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
            const symbolFiles = [1, 2] as any[];
            const worker = new UploadWorker(1, versionsClient, symbolFiles);

            await worker.upload(database, application, version);

            expect(versionsClient.postSymbols).toHaveBeenCalledWith(database, application, version, [symbolFiles[0]]);
            expect(versionsClient.postSymbols).toHaveBeenCalledWith(database, application, version, [symbolFiles[1]]);
        });

        it('should call versionsClient.postSymbols for each symbol file', async () => {
            const symbolFiles = [1, 2] as any[];
            const worker = new UploadWorker(1, versionsClient, symbolFiles);

            await worker.upload(database, application, version);

            expect(versionsClient.postSymbols).toHaveBeenCalledTimes(symbolFiles.length);
        });

        it('should wait 10ms between each symbol file upload', async () => {
            const symbolFiles = [1, 2] as any[];
            const waitSpy = jasmine.createSpy();
            waitSpy.and.resolveTo();
            const worker = new UploadWorker(1, versionsClient, symbolFiles);
            worker.wait = waitSpy;

            await worker.upload(database, application, version);

            expect(waitSpy).toHaveBeenCalledTimes(symbolFiles.length);
        });
    });
});