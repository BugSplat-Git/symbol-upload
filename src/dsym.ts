import { createMachoFiles, FatFile } from 'macho-uuid';
import { mkdir } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { tmpDir } from './tmp';
import { SymbolFileInfo } from './info';

export async function getDSymFileInfos(path: string): Promise<SymbolFileInfo[]> {
    try {
        const machoFiles = await createMachoFiles(path);

        if (!machoFiles.length) {
            throw new Error(`${path} is not a valid Mach-O file`);
        }

        return Promise.all(
            machoFiles.map(async (macho) => {
                const dbgId = await macho.getUUID();
                const moduleName = dirname(macho.path).split(sep).find(part => part.toLowerCase().includes('.dsym'))!;
                const relativePath = join(await macho.getUUID(), moduleName)
                const path = join(tmpDir, relativePath);
                await mkdir(dirname(path), { recursive: true });
                await macho.writeFile(path);
                return {
                    path,
                    relativePath,
                    dbgId,
                    moduleName,
                }
            })
        );
    } catch {
        console.log(`Could not create macho files for ${path}, skipping...`);
        return [];
    }
}