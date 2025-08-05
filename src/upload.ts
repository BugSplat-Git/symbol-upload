import { ApiClient, SymbolsApiClient, VersionsApiClient } from "@bugsplat/js-api-client";
import { availableParallelism } from "node:os";
import prettyBytes from "pretty-bytes";
import { pool } from "workerpool";
import { SymbolFileInfo } from './info';
import { findCompressionWorkerPath } from "./preload";
import { createWorkersFromSymbolFiles } from './worker';

const maxWorkers = availableParallelism();
const workerPool = pool(findCompressionWorkerPath(), { maxWorkers });

export async function uploadSymbolFiles(bugsplat: ApiClient, database: string, application: string, version: string, symbolFileInfos: Array<SymbolFileInfo>) {
    console.log(`About to upload symbols for ${database}-${application}-${version}...`);

    const startTime = new Date();
    
    const symbolsApiClient = new SymbolsApiClient(bugsplat);
    const versionsApiClient = new VersionsApiClient(bugsplat);
    const workers = createWorkersFromSymbolFiles(workerPool, maxWorkers, symbolFileInfos, [symbolsApiClient, versionsApiClient]);
    const uploads = workers.map((worker) => worker.upload(database, application, version));
    const stats = await Promise.all(uploads).then(stats => stats.flat());

    const endTime = new Date();
    const size = stats.reduce((acc, curr) => acc + curr.size, 0);
    const seconds = (endTime.getTime() - startTime.getTime()) / 1000;

    console.log(`Uploaded ${symbolFileInfos.length} symbols totaling ${prettyBytes(size)} @ ${prettyBytes(size / seconds)}/sec`);
}
