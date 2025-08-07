import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { getDSymFileInfos } from "./dsym";
import { tryGetElfUUID } from "./elf";
import { tryGetPdbGuid, tryGetPeGuid } from "./pdb";
import { getSymFileInfo } from "./sym";

export type SymbolFileInfo = {
    path: string;
    moduleName: string;
    dbgId: string;
}

export async function createSymbolFileInfos(symbolFilePath: string): Promise<SymbolFileInfo[]> {
    const path = symbolFilePath;
    const isFolder = await stat(path).then((stats) => stats.isDirectory());
    const extLowerCase = extname(path).toLowerCase();
    const isSymFile = extLowerCase.includes('.sym') && !isFolder;
    const isPdbFile = extLowerCase.includes('.pdb') && !isFolder;
    const isPeFile = extLowerCase.includes('.exe') || extLowerCase.includes('.dll') && !isFolder;
    const isDsymBundle = extLowerCase.includes('.dsym');
    const isElfFile = elfExtensions.some((ext) => extLowerCase.includes(ext) && !isFolder);

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

const elfExtensions = ['.elf', '.self', '.prx', '.sprx', '.nss'];