import { UploadableFile, VersionsApiClient } from "@bugsplat/js-api-client";

export function createWorkersFromSymbolFiles(versionsClient: VersionsApiClient, symbolFiles: UploadableFile[], workerCount: number): Array<UploadWorker> {
    const numberOfSymbols = symbolFiles.length;
    
    if (workerCount >= numberOfSymbols) {
        return symbolFiles.map((symbolFile, i) => new UploadWorker(i + 1, versionsClient, [symbolFile]));
    }

    const sorted = symbolFiles.sort((a, b) => a.size - b.size);
    const symbolFilesChunks = splitToChunks(sorted, workerCount);
    return symbolFilesChunks.map((chunk, i) => new UploadWorker(i + 1, versionsClient, chunk));
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
    constructor(
        private id: number,
        private versionsClient: VersionsApiClient,
        private symbolFiles: UploadableFile[]
    ) { }
    
    async upload(database: string, application: string, version: string) {
        console.log(`Worker ${this.id} uploading ${this.symbolFiles.length} symbol files...`);

        for (const symbolFile of this.symbolFiles) {
            console.log(`Worker ${this.id} uploading ${symbolFile.name}...`);

            await this.versionsClient.postSymbols(database, application, version, [symbolFile]);

            console.log(`Worker ${this.id} uploaded ${symbolFile.name}!`);
        }
    }
}
