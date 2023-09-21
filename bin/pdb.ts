import { PdbFile, PeFile } from 'pdb-guid';

export async function tryGetPdbGuid(pdbFilePath: string): Promise<string> {
    try {
        const pdbFile = await PdbFile.createFromFile(pdbFilePath);
        return `${pdbFile.guid}`;
    } catch (error) {
        console.log(`Could not get guid for ${pdbFilePath}...`);
    }

    return '';
}

export async function tryGetPeGuid(peFilePath: string): Promise<string> {
    try {
        const pdbFile = await PeFile.createFromFile(peFilePath);
        return `${pdbFile.guid}`;
    } catch (error) {
        console.log(`Could not get guid for ${peFilePath}...`);
    }

    return '';
}