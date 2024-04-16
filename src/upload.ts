import { ApiClient, SymbolsApiClient, VersionsApiClient } from "@bugsplat/js-api-client";
import { basename, dirname, extname, join, relative } from "node:path";
import { pool } from "workerpool";
import { getDSymFileInfos } from './dsym';
import { tryGetElfUUID } from './elf';
import { SymbolFileInfo } from './info';
import { tryGetPdbGuid, tryGetPeGuid } from './pdb';
import { getSymFileInfo } from './sym';
import { createWorkersFromSymbolFiles } from './worker';

const workerPool = pool(join(__dirname, 'compression.js'));

// TODO BG should symbolFilePaths be relative to directory?
export async function uploadSymbolFiles(bugsplat: ApiClient, database: string, application: string, version: string, directory: string, symbolFilePaths: Array<string>) {
    console.log(`About to upload symbols for ${database}-${application}-${version}...`);

    const symbolsApiClient = new SymbolsApiClient(bugsplat);
    const versionsApiClient = new VersionsApiClient(bugsplat);
    const symbolFiles = await Promise.all(
        symbolFilePaths.map(async (symbolFilePath) => await createSymbolFileInfos(directory, symbolFilePath))
    ).then(array => array.flat());
    const workers = createWorkersFromSymbolFiles(workerPool, symbolFiles, [symbolsApiClient, versionsApiClient]);
    const uploads = workers.map((worker) => worker.upload(database, application, version));
    await Promise.all(uploads);

    console.log('Symbols uploaded successfully!');
}

async function createSymbolFileInfos(searchDirectory: string, symbolFilePath: string): Promise<SymbolFileInfo[]> {
    const path = symbolFilePath;
    const relativePath = relative(searchDirectory, dirname(path));
    const extLowerCase = extname(path).toLowerCase();
    const isSymFile = extLowerCase.includes('.sym');
    const isPdbFile = extLowerCase.includes('.pdb');
    const isPeFile = extLowerCase.includes('.exe') || extLowerCase.includes('.dll');
    const isElfFile = extLowerCase.includes('.elf') || extLowerCase.includes('.self');
    const isDsymFile = extLowerCase.includes('.dsym');

    if (isPdbFile) {
        const dbgId = await tryGetPdbGuid(path);
        const moduleName = basename(path);
        return [{
            path,
            dbgId,
            moduleName,
            relativePath
        } as SymbolFileInfo];
    }

    if (isPeFile) {
        const dbgId = await tryGetPeGuid(path);
        const moduleName = basename(path);
        return [{
            path,
            dbgId,
            moduleName,
            relativePath
        } as SymbolFileInfo];
    }

    if (isSymFile) {
        const { dbgId, moduleName } = await getSymFileInfo(path);
        return [{
            path,
            dbgId,
            moduleName,
            relativePath
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
            relativePath
        } as SymbolFileInfo];
    }

    const dbgId = '';
    const moduleName = basename(path);
    return [{
        path,
        dbgId,
        moduleName,
        relativePath
    } as SymbolFileInfo];
}