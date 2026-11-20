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

        const slices = machoFiles.map(async (macho) => {
            const sourcePath = macho.path;
            if (!sourcePath) {
                throw new Error('Mach-O file is missing a source path');
            }
            const dbgId = await macho.getUUID();
            const moduleName = basename(sourcePath);
            const relativePath = join(await macho.getUUID(), moduleName)
            const path = join(tmpDir, relativePath);
            await mkdir(dirname(path), { recursive: true });
            await writeMachoSlice(macho, path);
            return {
                path,
                dbgId,
                moduleName,
            }
        });

        // Wait for every slice, even once one has failed. Callers remove tmpDir when this rejects,
        // which has to happen after the last slice is done being written.
        return Promise.allSettled(slices).then(() => Promise.all(slices));
    } catch {
        console.log(`Could not create macho files for ${path}, skipping...`);
        return [];
    }
}
