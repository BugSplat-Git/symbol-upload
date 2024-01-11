import { createMachoFiles, FatFile } from 'macho-uuid';
import { dirname, sep } from 'node:path';

export async function getDSymFileInfos(path: string): Promise<{ dbgId: string, moduleName: string, fat: boolean }[]> {
    try {
        const machoFiles = await createMachoFiles(path);

        if (!machoFiles.length) {
            throw new Error(`${path} is not a valid Mach-O file`);
        }

        return Promise.all(
            machoFiles.map(async (machoFile) => {
                const fat = await FatFile.isFat(machoFile.path);
                const dbgId = await machoFile.getUUID();
                const moduleName = dirname(machoFile.path).split(sep).find(part => part.toLowerCase().includes('.dsym'))!;
                return {
                    dbgId,
                    moduleName,
                    fat
                }
            })
        );
    } catch {
        console.log(`Could not create macho files for ${path}, skipping...`);
        return [{
            dbgId: '',
            moduleName: '',
            fat: false
        }];
    }
}