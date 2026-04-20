import { createMachoFiles, MachoFile } from 'macho-uuid';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { SymbolFileInfo } from './info';
import { tmpDir } from './tmp';

async function writeMachoSlice(macho: MachoFile, outputPath: string): Promise<void> {
    if (!macho.path) {
        throw new Error('MachoFile has no source path');
    }
    const readStream = createReadStream(macho.path, {
        start: macho.headerOffset,
        end: macho.headerOffset + macho.size,
    });
    const writeStream = createWriteStream(outputPath);
    await pipeline(readStream, writeStream);
}

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
                await writeMachoSlice(macho, path);
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
