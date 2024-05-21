import { createMachoFiles } from 'macho-uuid';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { SymbolFileInfo } from './info';
import { tmpDir } from './tmp';

export async function getDSymFileInfos(path: string): Promise<SymbolFileInfo[]> {
    try {
        const machoFiles = await createMachoFiles(path);

        if (!machoFiles.length) {
            throw new Error(`${path} is not a valid Mach-O file`);
        }

        return Promise.all(
            machoFiles.map(async (macho) => {
                const dbgId = await macho.getUUID();
                const moduleName = basename(macho.path);
                const relativePath = join(await macho.getUUID(), moduleName)
                const path = join(tmpDir, relativePath);
                await mkdir(dirname(path), { recursive: true });
                await macho.writeFile(path);
                return {
                    path,
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
