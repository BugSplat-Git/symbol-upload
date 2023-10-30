import { ApiClient, SymbolsApiClient, VersionsApiClient } from "@bugsplat/js-api-client";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import { pool } from "workerpool";
import { SymbolFileInfo } from './info';
import { tryGetPdbGuid, tryGetPeGuid } from './pdb';
import { getSymFileInfo } from './sym';
import { safeRemoveTmp, tmpDir } from './tmp';
import { createWorkersFromSymbolFiles } from './worker';
import { glob } from "glob";

const workerPool = pool(join(__dirname, 'compression.js'));

export async function uploadSymbolFiles(bugsplat: ApiClient, database: string, application: string, version: string, directory: string, filesGlob: string) {
    try {
        const globPattern = `${directory}/${filesGlob}`;

        const symbolFilePaths = await glob(globPattern);

        if (!symbolFilePaths.length) {
            throw new Error(`Could not find any files to upload using glob ${globPattern}!`);
        }

        console.log(`Found files:\n ${symbolFilePaths.join('\n')}`);
        console.log(`About to upload symbols for ${database}-${application}-${version}...`);

        if (!existsSync(tmpDir)) {
            await mkdir(tmpDir);
        }
        
        const symbolsApiClient = new SymbolsApiClient(bugsplat);
        const versionsApiClient = new VersionsApiClient(bugsplat);
        const symbolFiles = await Promise.all(symbolFilePaths.map(async (symbolFilePath) => await createSymbolFileInfo(directory, symbolFilePath)));
        const workers = createWorkersFromSymbolFiles(workerPool, symbolFiles, [symbolsApiClient, versionsApiClient]);
        const uploads = workers.map((worker) => worker.upload(database, application, version));
        await Promise.all(uploads);

        console.log('Symbols uploaded successfully!');
    } finally {
        await safeRemoveTmp();
    }
}

async function createSymbolFileInfo(searchDirectory: string, symbolFilePath: string): Promise<SymbolFileInfo> {
    const path = symbolFilePath;
    const relativePath = relative(searchDirectory, dirname(path));
    const extLowerCase = extname(path).toLowerCase();
    const isSymFile = extLowerCase.includes('.sym');
    const isPdbFile = extLowerCase.includes('.pdb');
    const isPeFile = extLowerCase.includes('.exe') || extLowerCase.includes('.dll');

    let dbgId = '';
    let moduleName = '';

    if (isPdbFile) {
        dbgId = await tryGetPdbGuid(path);
    }

    if (isPeFile) {
        dbgId = await tryGetPeGuid(path);
    }

    if (isSymFile) {
        ({ dbgId, moduleName } = await getSymFileInfo(path));
    }

    moduleName = moduleName || basename(path);

    return {
        path,
        dbgId,
        moduleName,
        relativePath
    } as SymbolFileInfo;
}