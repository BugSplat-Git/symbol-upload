import { createFromFile } from 'pdb-guid';

export async function tryGetGuid(filePath: string): Promise<string> {
    try {
        const file = await createFromFile(filePath);
        return `${file.guid}`;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.log(`Could not get UUID for ${filePath}: ${reason}`);
    }

    return '';
}
