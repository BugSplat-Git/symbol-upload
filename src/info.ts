import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { getDSymFileInfos } from "./dsym";
import { tryGetElfUUID } from "./elf";
import { tryGetGuid } from "./guid";
import { getSymFileInfo } from "./sym";

export type SymbolFileInfo = {
    path: string;
    moduleName: string;
    dbgId: string;
}

export async function filterSymbolFilePaths(symbolFilePaths: string[]): Promise<string[]> {
    const keep = await Promise.all(
        symbolFilePaths.map(async (path) => {
            const isFolder = await stat(path).then((stats) => stats.isDirectory()).catch(() => false);
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

    const dbgId = '';
    const moduleName = basename(path);
    return [{
        path,
        dbgId,
        moduleName,
    } as SymbolFileInfo];
}

function isDsymBundlePath(path: string): boolean {
    return extname(path).toLowerCase().includes('.dsym');
}

const elfExtensions = ['.elf', '.self', '.prx', '.sprx', '.nss', '.nrs', '.bin'];