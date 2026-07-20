import { SymbolsApiClient, VersionsApiClient } from '@bugsplat/js-api-client';
import { IPolicy } from 'cockatiel';
import { ReadStream, createReadStream } from 'fs';
import { stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import prettyBytes from 'pretty-bytes';
import { WorkerPool } from 'workerpool';
import { SymbolFileInfo } from './info';
import { createUploadRetryPolicy } from './retry';
import { tmpDir } from './tmp';

export type UploadStats = { name: string, size: number };

export function createWorkersFromSymbolFiles(workerPool: WorkerPool, workerCount: number, symbolFiles: SymbolFileInfo[], clients: [SymbolsApiClient, VersionsApiClient]): Array<UploadWorker> {
    const numberOfSymbols = symbolFiles.length;

    // Shared across every worker in this run so the circuit breaker can coordinate them: one 429
    // trips the breaker and all workers back off, since they all upload from the same IP.
    const retryPolicy = createUploadRetryPolicy();

    if (workerCount >= numberOfSymbols) {
        return symbolFiles.map((symbolFile, i) => new UploadWorker(i + 1, [symbolFile], workerPool, ...clients, retryPolicy));
    }

    const symbolFilesChunks = splitToChunks(symbolFiles, workerCount);
    return symbolFilesChunks.map((chunk, i) => new UploadWorker(i + 1, chunk, workerPool, ...clients, retryPolicy));
}

export class UploadWorker {
    private createReadStream = createReadStream;
    private stat = stat;
    private toWeb = ReadStream.toWeb;

    constructor(
        public readonly id: number,
        public readonly symbolFileInfos: SymbolFileInfo[],
        private readonly pool: WorkerPool,
        private readonly symbolsClient: SymbolsApiClient,
        private readonly versionsClient: VersionsApiClient,
        private readonly retryPolicy: IPolicy,
    ) { }

    async upload(database: string, application: string, version: string): Promise<UploadStats[]> {
        console.log(`Worker ${this.id} uploading ${this.symbolFileInfos.length} symbol files...`);

        const results = [] as UploadStats[];

        for (const symbolFileInfo of this.symbolFileInfos) {
            try {
                results.push(await this.uploadSingle(database, application, version, symbolFileInfo));
            } catch (error) {
                console.error(`Worker ${this.id} failed to upload ${symbolFileInfo.path}: ${(error as Error).message}`);
                throw error;
            }
        }

        return results;
    }

    private async uploadSingle(database: string, application: string, version: string, symbolFileInfo: SymbolFileInfo): Promise<UploadStats> {
        const { dbgId, moduleName, path } = symbolFileInfo;
        const fileName = basename(path);
        const uncompressedSize = await this.stat(path).then(stats => stats.size);
        const uuid = crypto.randomUUID();
        const isZip = extname(path).toLowerCase().includes('.zip');

        let client: SymbolsApiClient | VersionsApiClient = this.versionsClient;
        let name = basename(path);
        let tmpFileName = '';

        // We can't store source maps without a dbgId, fallback to legacy
        const isSourceMap = extname(path).toLowerCase() === '.map';

        // Unreal binary encodes Linux sym files, fallback to legacy
        const isUnrealSym = extname(path).toLowerCase() === '.sym' && !dbgId;

        if (dbgId && !isZip) {
            tmpFileName = join(tmpDir, `${fileName}-${dbgId}-${uuid}.gz`);
            client = this.symbolsClient;
            await this.pool.exec('createGzipFile', [path, tmpFileName]);
        } else if (isSourceMap || isUnrealSym || isZip) {
            if (isZip) {
                tmpFileName = path;
            } else {
                name = `${name}.zip`;
                tmpFileName = join(tmpDir, `${fileName}-${dbgId}-${uuid}.zip`);
                await this.pool.exec('createZipFile', [path, tmpFileName]);
            }
        } else {
            console.warn(`Worker ${this.id} skipping ${name} (extension: ${extname(path)}), missing dbgId...`);
            return { name, size: 0 };
        }

        const { mtime: lastModified } = await this.stat(path);
        const { size } =  await this.stat(tmpFileName);
        const startTime = new Date();

        console.log(`Worker ${this.id} uploading ${name}...`);

        await this.retryPolicy.execute(async () => {
            const symFileReadStream = this.createReadStream(tmpFileName);
            const file = this.toWeb(symFileReadStream);
            const symbolFile = {
                name,
                size,
                file,
                uncompressedSize,
                dbgId,
                lastModified,
                moduleName
            };

            try {
                await client.postSymbols(database, application, version, [symbolFile]);
            } catch (error) {
                // Don't try and cancel the web stream, it's locked by the tee operation in the symbols client.
                // Cancelling the file stream should be safe and seems like a good thing to do...
                symFileReadStream.destroy();
                throw error;
            }
        });

        const endTime = new Date();
        const seconds = (endTime.getTime() - startTime.getTime()) / 1000;
        const rate = size / seconds || 0;
        console.log(`Worker ${this.id} uploaded ${name}! (${prettyBytes(size)} @ ${prettyBytes(rate)}/sec)`);
        return {
            name,
            size
        }
    }
}

function splitToChunks<T>(array: Array<T>, parts: number): Array<Array<T>> {
    const copy = [...array];
    const result = [] as Array<Array<T>>;
    for (let i = parts; i > 0; i--) {
        result.push(copy.splice(0, Math.ceil(array.length / parts)));
    }
    return result;
}