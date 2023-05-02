import { UploadableFile, VersionsApiClient } from "@bugsplat/js-api-client";

export function createWorkersFromSymbolFiles(versionsClient: VersionsApiClient, symbolFiles: UploadableFile[], workerCount: number): Array<UploadWorker> {
    const numberOfSymbols = symbolFiles.length;
    
    if (workerCount >= numberOfSymbols) {
        return symbolFiles.map((symbolFile, i) => new UploadWorker(i + 1, versionsClient, [symbolFile]));
    }

    const symbolFilesChunks = splitToChunks(symbolFiles, workerCount);
    return symbolFilesChunks.map((chunk, i) => new UploadWorker(i + 1, versionsClient, chunk));
}

function splitToChunks<T>(array: Array<T>, parts: number): Array<Array<T>> {
    const copy = [...array];
    const result = [] as Array<Array<T>>;
    for (let i = parts; i > 0; i--) {
        result.push(copy.splice(0, Math.ceil(array.length / i)));
    }
    return result;
}

export class UploadWorker {
    public wait = wait;

    constructor(
        private id: number,
        private versionsClient: VersionsApiClient,
        private symbolFiles: UploadableFile[]
    ) { }
    
    async upload(database: string, application: string, version: string) {
        console.log(`Worker ${this.id} uploading ${this.symbolFiles.length} symbol files...`);
        for (const symbolFile of this.symbolFiles) {
            await this.versionsClient.postSymbols(database, application, version, [symbolFile]).then(() => this.wait(10));
        }
    }
}

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}