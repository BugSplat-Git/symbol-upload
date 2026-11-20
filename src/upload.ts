import { ApiClient, SymbolsApiClient, VersionsApiClient } from "@bugsplat/js-api-client";
import { availableParallelism } from "node:os";
import prettyBytes from "pretty-bytes";
import { pool } from "workerpool";
import { SymbolFileInfo } from './info';
import { findCompressionWorkerPath } from "./preload";
import { createWorkersFromSymbolFiles, UploadStats } from './worker';

const maxWorkers = availableParallelism();
const workerPool = pool(findCompressionWorkerPath(), { maxWorkers });

// Workers hold a MessagePort open, which would keep node alive forever once we stop calling process.exit().
// Terminate with force so a stuck compression worker can't hold the CLI open: the default waits for
// in-progress tasks, while force cancels them and workerpool hard-kills anything that ignores the
// terminate message within workerTerminateTimeout.
export async function terminateWorkerPool(terminator = () => workerPool.terminate(true)): Promise<void> {
    try {
        await terminator();
    } catch (error) {
        console.error('Could not terminate the worker pool!', error);
    }
}

// The uploadSymbolFiles calls that are still uploading. They all share the pool and tmpDir.
const uploadsInProgress = new Set<Promise<unknown>>();

// For a caller that can't know whether it is the only one uploading. uploadSymbols stops the workers
// and removes tmpDir when it is done, which must not happen under an upload that someone else started
// with uploadSymbolFiles, so this waits for every upload in progress before it terminates the pool.
// An upload that starts while the pool is terminating gets new workers, so wait for it and go again.
export async function terminateWorkerPoolWhenIdle(terminator?: Parameters<typeof terminateWorkerPool>[0]): Promise<void> {
    do {
        while (uploadsInProgress.size) {
            await Promise.allSettled(uploadsInProgress);
        }

        await terminateWorkerPool(terminator);
    } while (uploadsInProgress.size);
}

export async function uploadSymbolFiles(bugsplat: ApiClient, database: string, application: string, version: string, symbolFileInfos: Array<SymbolFileInfo>) {
    console.log(`About to upload symbols for ${database}-${application}-${version}...`);

    const startTime = new Date();
    
    const symbolsApiClient = new SymbolsApiClient(bugsplat);
    const versionsApiClient = new VersionsApiClient(bugsplat);
    const workers = createWorkersFromSymbolFiles(workerPool, maxWorkers, symbolFileInfos, [symbolsApiClient, versionsApiClient]);
    const uploads = workers.map((worker) => worker.upload(database, application, version));

    // Wait for every worker to stop before reporting a failure. Callers terminate the worker pool and
    // remove tmpDir as soon as this settles, which has to happen after the last worker is done with both.
    const settled = Promise.allSettled(uploads);
    uploadsInProgress.add(settled);
    const results = await settled.finally(() => uploadsInProgress.delete(settled));
    const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');

    if (failure) {
        throw failure.reason;
    }

    const stats = results.flatMap((result) => (result as PromiseFulfilledResult<UploadStats[]>).value);

    const endTime = new Date();
    const size = stats.reduce((acc, curr) => acc + curr.size, 0);
    const seconds = (endTime.getTime() - startTime.getTime()) / 1000;

    console.log(`Uploaded ${symbolFileInfos.length} symbols totaling ${prettyBytes(size)} @ ${prettyBytes(size / seconds)}/sec`);
}
