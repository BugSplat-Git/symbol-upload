import { ElfFile } from '@bugsplat/elfy';

export async function tryGetElfUUID(path: string) {
  try {
    let success: boolean, section: Buffer | undefined;

    using elfFile = await ElfFile.create(path);
    ({ success, section } = await elfFile.tryReadSection('.note.gnu.build-id'));

    if (success) {
      return getUUID(section!, 16);
    }

    ({ success, section } = await elfFile.tryReadSection('.sce_special'));

    if (success) {
      return getUUID(section!);
    }
  } catch (error) {
    console.log(`Could not get UUID for ${path}...`);
  }

  return '';
}

function getUUID(section: Buffer, offset = 0) {
  return section.subarray(offset, offset + 20).toString('hex');
}