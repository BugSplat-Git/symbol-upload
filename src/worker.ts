import { BugSplatAuthenticationError, SymbolsApiClient, VersionsApiClient } from '@bugsplat/js-api-client';
import filenamify from 'filenamify';
import { ReadStream, createReadStream, existsSync, mkdirSync } from 'fs';
import { stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import prettyBytes from 'pretty-bytes';
import retryPromise from 'promise-retry';
import { WorkerPool } from 'workerpool';
import { SymbolFileInfo } from './info';
import { tmpDir } from './tmp';

export type UploadStats = { name: string, size: number };

export function createWorkersFromSymbolFiles(workerPool: WorkerPool, workerCount: number, symbolFiles: SymbolFileInfo[], clients: [SymbolsApiClient, VersionsApiClient]): Array<UploadWorker> {
    const numberOfSymbols = symbolFiles.length;

    if (workerCount >= numberOfSymbols) {
        return symbolFiles.map((symbolFile, i) => new UploadWorker(i + 1, [symbolFile], workerPool, ...clients));
    }

    const symbolFilesChunks = splitToChunks(symbolFiles, workerCount);
    return symbolFilesChunks.map((chunk, i) => new UploadWorker(i + 1, chunk, workerPool, ...clients));
}

export class UploadWorker {
    private createReadStream = createReadStream;
    private retryPromise = retryPromise;
    private stat = stat;
    private toWeb = ReadStream.toWeb;

    constructor(
        public readonly id: number,
        public readonly symbolFileInfos: SymbolFileInfo[],
        private readonly pool: WorkerPool,
        private readonly symbolsClient: SymbolsApiClient,
        private readonly versionsClient: VersionsApiClient,
    ) { }

    async upload(database: string, application: string, version: string): Promise<UploadStats[]> {
        console.log(`Worker ${this.id} uploading ${this.symbolFileInfos.length} symbol files...`);

        const results = [] as UploadStats[];

        for (const symbolFileInfo of this.symbolFileInfos) {
            results.push(await this.uploadSingle(database, application, version, symbolFileInfo));
        }
        
        return results;
    }

    private async uploadSingle(database: string, application: string, version: string, symbolFileInfo: SymbolFileInfo): Promise<UploadStats> {
        const { dbgId, moduleName, path } = symbolFileInfo;
        const folderPrefix = dirname(path).replace(/\\/g, '-').replace(/\//g, '-');
        const fileName = folderPrefix ? [folderPrefix, basename(path)].join('-') : basename(path);
        const uncompressedSize = await this.stat(path).then(stats => stats.size);
        const timestamp = Math.round(new Date().getTime() / 1000);
        const isZip = extname(path).toLowerCase().includes('.zip');

        let client: SymbolsApiClient | VersionsApiClient = this.versionsClient;
        let name = basename(path);
        let tmpFileName = '';

        if (dbgId && !isZip) {
            const tmpSubdir = join(tmpDir, filenamify(dirname(path)));
            if (!existsSync(tmpSubdir)) {
                mkdirSync(tmpSubdir, { recursive: true });
            }
            tmpFileName = join(tmpSubdir, `${fileName}.gz`);
            client = this.symbolsClient;
            await this.pool.exec('createGzipFile', [path, tmpFileName]);
        } else if (!isZip) {
            name = `${name}.zip`;
            tmpFileName = join(tmpDir, `${fileName}-${timestamp}.zip`);
            await this.pool.exec('createZipFile', [path, tmpFileName]);
        } else {
            tmpFileName = path;
        }

        const stats = await this.stat(tmpFileName);
        const lastModified = stats.mtime;
        const size = stats.size;
        const startTime = new Date();

        console.log(`Worker ${this.id} uploading ${name}...`);

        await this.retryPromise(async (retry) => {
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

            return client.postSymbols(database, application, version, [symbolFile])
                .catch((error: Error | BugSplatAuthenticationError) => {
                    // Don't try and cancel the web stream, it's locked by the tee operation in the symbols client.
                    // Cancelling the file stream should be safe and seems like a good thing to do...
                    symFileReadStream.destroy();

                    if (isAuthenticationError(error)) {
                        console.error(`Worker ${this.id} failed to upload ${name}: ${error.message}!`);
                        throw error;
                    }

                    if (isMaxSizeExceededError(error)) {
                        console.error(`Worker ${this.id} failed to upload ${name}: ${error.message}!`);
                        throw error;
                    }

                    console.error(`Worker ${this.id} failed to upload ${name} with error: ${error.message}! Retrying...`)
                    retry(error);
                })
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

function isAuthenticationError(error: Error | BugSplatAuthenticationError): error is BugSplatAuthenticationError {
    return (error as BugSplatAuthenticationError).isAuthenticationError;
}

function isMaxSizeExceededError(error: Error): boolean {
    return error.message.includes('Symbol file max size') || error.message.includes('Symbol table max size');
}