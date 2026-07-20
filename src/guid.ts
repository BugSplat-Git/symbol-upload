import { createFromFile } from 'pdb-guid';
import { tryGetPortablePdbGuid } from './portable-pdb';

export async function tryGetGuid(filePath: string): Promise<string> {
    // Try the portable (.NET) parser first so we get the SSQP-correct FFFFFFFF
    // age. pdb-guid 2.x can parse portable PDBs, but it hardcodes age 1, which
    // produces the wrong symbol-store key for managed PDBs.
    try {
        return await tryGetPortablePdbGuid(filePath);
    } catch {
        // Not a portable PDB - fall through to native MSF PDB / PE handling.
    }

    try {
        const file = await createFromFile(filePath);
        return `${file.guid}`;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.log(`Could not get UUID for ${filePath}: ${reason}`);
    }

    return '';
}
