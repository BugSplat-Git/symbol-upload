import { PdbFile, PeFile } from 'pdb-guid';
import { tryGetPortablePdbGuid } from './portable-pdb';

export async function tryGetPdbGuid(pdbFilePath: string): Promise<string> {
    try {
        const pdbFile = await PdbFile.createFromFile(pdbFilePath);
        return `${pdbFile.guid}`;
    } catch {
        // Not a native Windows PDB - fall through and try the portable (.NET) PDB format.
    }

    try {
        return await tryGetPortablePdbGuid(pdbFilePath);
    } catch (error) {
        console.log(`Could not get UUID for ${pdbFilePath}...`);
    }

    return '';
}

export async function tryGetPeGuid(peFilePath: string): Promise<string> {
    try {
        const pdbFile = await PeFile.createFromFile(peFilePath);
        return `${pdbFile.guid}`;
    } catch (error) {
        console.log(`Could not get UUID for ${peFilePath}...`);
    }

    return '';
}