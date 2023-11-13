import { SymbolsApiClient, VersionsApiClient } from '@bugsplat/js-api-client';
import { ReadStream, createReadStream } from 'fs';
import { stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import retryPromise from 'promise-retry';
import { WorkerPool, cpus } from 'workerpool';
import { SymbolFileInfo } from './info';
import { tmpDir } from './tmp';
const workerCount = cpus;

export function createWorkersFromSymbolFiles(workerPool: WorkerPool, symbolFiles: SymbolFileInfo[], clients: [SymbolsApiClient, VersionsApiClient]): Array<UploadWorker> {
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
    
    async upload(database: string, application: string, version: string): Promise<void> {
        console.log(`Worker ${this.id} uploading ${this.symbolFileInfos.length} symbol files...`);

        await Promise.all(
            this.symbolFileInfos.map((symbolFileInfo) => this.uploadSingle(database, application, version, symbolFileInfo))
        );
    }

    private async uploadSingle(database: string, application: string, version: string, symbolFileInfo: SymbolFileInfo): Promise<void> {
        const { dbgId, path, moduleName, relativePath } = symbolFileInfo;
        const folderPrefix = relativePath.replace(/\\/g, '-');
        const fileName = folderPrefix ? [folderPrefix, basename(path)].join('-') : basename(path);
        const uncompressedSize = await this.stat(path).then(stats => stats.size);
        const timestamp = Math.round(new Date().getTime() / 1000);
        const isZip = extname(path).toLowerCase().includes('.zip');
        
        let client: SymbolsApiClient | VersionsApiClient = this.versionsClient;
        let name = basename(path);
        let tmpFileName = '';

        if (dbgId && !isZip) {  
            tmpFileName = join(tmpDir, `${fileName}.gz`);
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

        console.log(`Worker ${this.id} uploading ${name}...`);
        
        await this.retryPromise((retry) => 
            client.postSymbols(database, application, version, [symbolFile])
                .catch((error: Error) => {
                    symFileReadStream.destroy();
                    console.error(`Worker ${this.id} failed to upload ${name} with error: ${error.message}! Retrying...`)
                    retry(error);
                })
        );

        console.log(`Worker ${this.id} uploaded ${name}!`);
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
