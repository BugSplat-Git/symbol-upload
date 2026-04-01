import { createFromFile } from 'pdb-guid';

export async function tryGetGuid(filePath: string): Promise<string> {
    try {
        const file = await createFromFile(filePath);
        return `${file.guid}`;
    } catch (error) {
        console.log(`Could not get UUID for ${filePath}...`);
    }

    return '';
}
