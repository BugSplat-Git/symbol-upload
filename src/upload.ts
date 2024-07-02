import { ApiClient, SymbolsApiClient, VersionsApiClient } from "@bugsplat/js-api-client";
import { availableParallelism } from "node:os";
import { basename, extname } from "node:path";
import prettyBytes from "pretty-bytes";
import { pool } from "workerpool";
import { getDSymFileInfos } from './dsym';
import { tryGetElfUUID } from './elf';
import { SymbolFileInfo } from './info';
import { tryGetPdbGuid, tryGetPeGuid } from './pdb';
import { findCompressionWorkerPath } from "./preload";
import { getSymFileInfo } from './sym';
import { createWorkersFromSymbolFiles } from './worker';

const maxWorkers = availableParallelism();
const workerPool = pool(findCompressionWorkerPath(), { maxWorkers });

export async function uploadSymbolFiles(bugsplat: ApiClient, database: string, application: string, version: string, symbolFilePaths: Array<string>) {
    console.log(`About to upload symbols for ${database}-${application}-${version}...`);

    const startTime = new Date();

    const symbolsApiClient = new SymbolsApiClient(bugsplat);
    const versionsApiClient = new VersionsApiClient(bugsplat);
    const symbolFiles = await Promise.all(
        symbolFilePaths.map(async (symbolFilePath) => await createSymbolFileInfos(symbolFilePath))
    ).then(array => array.flat());
    const workers = createWorkersFromSymbolFiles(workerPool, maxWorkers, symbolFiles, [symbolsApiClient, versionsApiClient]);
    const uploads = workers.map((worker) => worker.upload(database, application, version));
    const stats = await Promise.all(uploads).then(stats => stats.flat());

    const endTime = new Date();
    const size = stats.reduce((acc, curr) => acc + curr.size, 0);
    const seconds = (endTime.getTime() - startTime.getTime()) / 1000;
    console.log(`Uploaded ${symbolFiles.length} symbols totaling ${prettyBytes(size)} @ ${prettyBytes(size / seconds)}/sec`);
}

async function createSymbolFileInfos(symbolFilePath: string): Promise<SymbolFileInfo[]> {
    const path = symbolFilePath;
    const extLowerCase = extname(path).toLowerCase();
    const isSymFile = extLowerCase.includes('.sym');
    const isPdbFile = extLowerCase.includes('.pdb');
    const isPeFile = extLowerCase.includes('.exe') || extLowerCase.includes('.dll');
    const isDsymFile = extLowerCase.includes('.dsym');
    const isElfFile = elfExtensions.some((ext) => extLowerCase.includes(ext));

    if (isPdbFile) {
        const dbgId = await tryGetPdbGuid(path);
        const moduleName = basename(path);
        return [{
            path,
            dbgId,
            moduleName,
        } as SymbolFileInfo];
    }

    if (isPeFile) {
        const dbgId = await tryGetPeGuid(path);
        const moduleName = basename(path);
        return [{
            path,
            dbgId,
            moduleName,
        } as SymbolFileInfo];
    }

    if (isSymFile) {
        const { dbgId, moduleName } = await getSymFileInfo(path);
        return [{
            path,
            dbgId,
            moduleName,
        } as SymbolFileInfo];
    }

    if (isDsymFile) {
        return getDSymFileInfos(path);
    }

    if (isElfFile) {
        const dbgId = await tryGetElfUUID(path);
        const moduleName = basename(path);
        return [{
            path,
            dbgId,
            moduleName,
        } as SymbolFileInfo];
    }

    const dbgId = '';
    const moduleName = basename(path);
    return [{
        path,
        dbgId,
        moduleName,
    } as SymbolFileInfo];
}

const elfExtensions = ['.elf', '.self', '.prx', '.sprx'];