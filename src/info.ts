import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { getDSymFileInfos } from "./dsym";
import { tryGetElfUUID } from "./elf";
import { tryGetGuid } from "./guid";
import { tryGetSourceMapDebugId } from "./source-map";
import { getSymFileInfo } from "./sym";

export type SymbolFileInfo = {
    path: string;
    moduleName: string;
    dbgId: string;
}

export async function filterSymbolFilePaths(symbolFilePaths: string[]): Promise<string[]> {
    const keep = await Promise.all(
        symbolFilePaths.map(async (path) => {
            const isFolder = await stat(path).then((stats) => stats.isDirectory());
            return !isFolder || isDsymBundlePath(path);
        })
    );
    return symbolFilePaths.filter((_, i) => keep[i]);
}

export async function createSymbolFileInfos(symbolFilePath: string): Promise<SymbolFileInfo[]> {
    const path = symbolFilePath;
    const isFolder = await stat(path).then((stats) => stats.isDirectory());
    const extLowerCase = extname(path).toLowerCase();
    const isSymFile = extLowerCase.includes('.sym') && !isFolder;
    const isPeOrPdbFile = (extLowerCase.includes('.pdb') || extLowerCase.includes('.exe') || extLowerCase.includes('.dll')) && !isFolder;
    const isDsymBundle = isDsymBundlePath(path);
    const isElfFile = elfExtensions.includes(extLowerCase) && !isFolder;
    const isSourceMap = extLowerCase === '.map' && !isFolder;

    if (isPeOrPdbFile) {
        const dbgId = await tryGetGuid(path);
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

    if (isDsymBundle) {
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

    if (isSourceMap) {
        // A source map with a debug ID is uploaded by that ID, like any other symbol file.
        // Without one dbgId stays empty and the map is uploaded by file name and version.
        const dbgId = await tryGetSourceMapDebugId(path);
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

function isDsymBundlePath(path: string): boolean {
    return extname(path).toLowerCase() === '.dsym';
}

const elfExtensions = ['.elf', '.self', '.prx', '.sprx', '.nss', '.nrs', '.bin'];