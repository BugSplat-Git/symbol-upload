import { VersionsApiClient } from '@bugsplat/js-api-client';
import { createReadStream } from 'fs';
import retryPromise from 'promise-retry';
import { SymbolFileInfo } from './symbol-file-info';

export function createWorkersFromSymbolFiles(versionsClient: VersionsApiClient, symbolFiles: SymbolFileInfo[], workerCount: number): Array<UploadWorker> {
    const numberOfSymbols = symbolFiles.length;
    
    if (workerCount >= numberOfSymbols) {
        return symbolFiles.map((symbolFile, i) => new UploadWorker(i + 1, [symbolFile], versionsClient));
    }

    const sorted = symbolFiles.sort((a, b) => a.size - b.size);
    const symbolFilesChunks = splitToChunks(sorted, workerCount);
    return symbolFilesChunks.map((chunk, i) => new UploadWorker(i + 1, chunk, versionsClient));
}

function splitToChunks<T>(array: Array<T>, parts: number): Array<Array<T>> {
    const copy = [...array];
    const result = [] as Array<Array<T>>;
    for (let i = parts; i > 0; i--) {
        result.push(copy.splice(0, Math.ceil(array.length / parts)));
    }
    return result;
}

export class UploadWorker {
    private createReadStream = createReadStream;
    private retryPromise = retryPromise;

    constructor(
        public readonly id: number,
        public readonly symbolFileInfos: SymbolFileInfo[],
        private versionsClient: VersionsApiClient,
    ) { }
    
    async upload(database: string, application: string, version: string): Promise<void> {
        console.log(`Worker ${this.id} uploading ${this.symbolFileInfos.length} symbol files...`);

        for (const symbolFileInfo of this.symbolFileInfos) {
            await this.retryPromise(
                (retry) => this.uploadSingle(database, application, version, symbolFileInfo).catch(retry)
            );
        }
    }

    private async uploadSingle(database: string, application: string, version: string, symbolFileInfo: SymbolFileInfo): Promise<void> {
        console.log(`Worker ${this.id} uploading ${symbolFileInfo.name}...`);

        const file = this.createReadStream(symbolFileInfo.file);
        const symbolFile = { ...symbolFileInfo, file };
        await this.versionsClient.postSymbols(database, application, version, [symbolFile])
            .catch(error => {
                symbolFile.file.destroy();
                throw error;
            });

        console.log(`Worker ${this.id} uploaded ${symbolFileInfo.name}!`);
    }
}
