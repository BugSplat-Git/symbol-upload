import { ElfFile } from '@bugsplat/elfy';
import { Buffer } from 'node:buffer';

export async function tryGetElfUUID(path: string) {
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

  return '';
}

function getUUID(section: Buffer, offset = 0) {
  return section.subarray(offset, offset + 20).toString('hex');
}