import { SymbolsApiClient, VersionsApiClient } from '@bugsplat/js-api-client';
import retryPromise from 'promise-retry';
import { SymbolFileInfo, SymbolFileType } from '../bin/symbol-file-info';
import { UploadWorker, createWorkersFromSymbolFiles } from '../bin/worker';

describe('worker', () => {
    let symbolsClients: jasmine.SpyObj<SymbolsApiClient>;
    let versionsClient: jasmine.SpyObj<VersionsApiClient>;
    let clients: [SymbolsApiClient, VersionsApiClient];

    beforeEach(() => {
        symbolsClients = jasmine.createSpyObj<SymbolsApiClient>('SymbolsApiClient', ['postSymbols']);
        versionsClient = jasmine.createSpyObj<VersionsApiClient>('VersionsApiClient', ['postSymbols']);
        symbolsClients.postSymbols.and.resolveTo();
        versionsClient.postSymbols.and.resolveTo();
        clients = [symbolsClients, versionsClient];
    });

    describe('createWorkersFromSymbolFiles', () => {
        it('should create max workers if symbol files exceeds worker count', () => {
            const symbolFiles = createFakeSymbolFileInfos(2);
            const workerCount = 1;

            const workers = createWorkersFromSymbolFiles(symbolFiles, workerCount, clients);

            expect(workers.length).toEqual(workerCount);
        });

        it('should create equal worker count to symbol files', () => {
            const symbolFiles = createFakeSymbolFileInfos(2);
            const workerCount = 2;

            const workers = createWorkersFromSymbolFiles(symbolFiles, workerCount, clients);

            expect(workers.length).toEqual(workerCount);
        });

        it('should spread symbol files evenly across workers', () => {
            const symbolFiles = createFakeSymbolFileInfos(5);
            const workerCount = 2;

            const workers = createWorkersFromSymbolFiles(symbolFiles, workerCount, clients);
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
            let symbolFiles;

            beforeEach(async () => {
                symbolFiles = createFakeSymbolFileInfos(2);
                const worker = createUploadWorkerWithFakeReadStream(1, symbolFiles, clients);
                await worker.upload(database, application, version);
            });

            it('should call versionsClient.postSymbols with database, application, version, and symbol files', () => {
                expect(versionsClient.postSymbols).toHaveBeenCalledWith(database, application, version, jasmine.arrayContaining([symbolFiles[0]]));
                expect(versionsClient.postSymbols).toHaveBeenCalledWith(database, application, version, jasmine.arrayContaining([symbolFiles[1]]));
            });
    
            it('should call versionsClient.postSymbols for each symbol file', () => {
                expect(versionsClient.postSymbols).toHaveBeenCalledTimes(symbolFiles.length);
            });
        });

        describe('symsrv', () => {
            let symbolFiles;

            beforeEach(async () => {
                symbolFiles = createFakeSymbolFileInfos(2);
                symbolFiles.forEach(symbolFile => symbolFile.type = SymbolFileType.symsrv);
                const worker = createUploadWorkerWithFakeReadStream(1, symbolFiles, clients);
                await worker.upload(database, application, version);
            });

            it('should call symbolsClients.postSymbols with database, application, version, and symbol files', () => {
                expect(symbolsClients.postSymbols).toHaveBeenCalledWith(database, application, version, jasmine.arrayContaining([symbolFiles[0]]));
                expect(symbolsClients.postSymbols).toHaveBeenCalledWith(database, application, version, jasmine.arrayContaining([symbolFiles[1]]));
            });
    
            it('should call symbolsClients.postSymbols for each symbol file', () => {
                expect(symbolsClients.postSymbols).toHaveBeenCalledTimes(symbolFiles.length);
            });
        });

        it('should retry failed uploads', async () => {
            const retries = 3;
            const retrier = (func) => retryPromise(func, { retries, minTimeout: 0, maxTimeout: 0, factor: 1 });
            const symbolFiles = createFakeSymbolFileInfos(1);
            const uploadSingle = jasmine.createSpy().and.callFake(() => Promise.reject(new Error('Failed to upload!')));
            const worker = new UploadWorker(1, symbolFiles, ...clients);
            (worker as any).uploadSingle = uploadSingle;
            (worker as any).retryPromise = retrier;

            await worker.upload(database, application, version).catch(() => null);

            expect(uploadSingle).toHaveBeenCalledTimes(retries * symbolFiles.length + 1);
        });

        it('should destroy file stream on error', async () => {
            const readStream = jasmine.createSpyObj('ReadStream', ['destroy']);
            const retrier = (func) => retryPromise(func, { retries: 0 });
            const symbolFiles = createFakeSymbolFileInfos(1);
            const worker = new UploadWorker(1, symbolFiles, ...clients);
            versionsClient.postSymbols.and.rejectWith(new Error('Failed to upload!'));
            (worker as any).createReadStream = () => readStream;
            (worker as any).toWeb = () => readStream;
            (worker as any).retryPromise = retrier;

            await worker.upload(database, application, version).catch(() => null);

            expect(readStream.destroy).toHaveBeenCalled();
        });
    });
});

function createFakeSymbolFileInfos(count: number) {
    return Array.from(Array(count).keys())
        .map((i) => createFakeSymbolFileInfo({
            name: `name${i}`,
            file: `file${i}`,
            moduleName: `moduleName${i}`,
            dbgId: `dbgId${i}`
        })
    );
}

function createFakeSymbolFileInfo(params: Partial<SymbolFileInfo>): SymbolFileInfo {
    const defaults = {
        name: 'name',
        file: 'file',
        moduleName: 'moduleName',
        size: 10,
        dbgId: '0',
        uncompressedSize: 100,
        lastModified: new Date(),
        type: SymbolFileType.legacy
    };
    return {
        ...defaults,
        ...params
    };
}

function createUploadWorkerWithFakeReadStream(id: number, symbolFileInfos: any[], clients: [SymbolsApiClient, VersionsApiClient]) {
    const worker = new UploadWorker(id, symbolFileInfos, ...clients);
    (worker as any).createReadStream = jasmine.createSpy().and.callFake(file => file);
    (worker as any).toWeb = jasmine.createSpy().and.callFake(file => file);
    return worker;
}