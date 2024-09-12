import { ElfFile } from '@bugsplat/elfy';
import { extname } from 'node:path';

export async function tryGetElfUUID(path: string) {
  let success: boolean, section: Buffer | undefined;

  using elfFile = await ElfFile.create(path);
  ({ success, section } = await elfFile.tryReadSection('.note.gnu.build-id'));

  if (success) {
    return getUUID(section!, path, 16);
  }

  ({ success, section } = await elfFile.tryReadSection('.sce_special'));

  if (success) {
    return getUUID(section!, path);
  }

  return '';
}

function getUUID(section: Buffer, path: string, offset = 0) {
  let uuid = section.subarray(offset, offset + 20).toString('hex');
  
  // Nintendo GUIDs seem to be 32 or 40 hex chars 0 padded to 64 hex chars
  // Until we know more, pad it ourselves with this hacky workaround
  if (extname(path)?.toLowerCase() === '.nss') {
    uuid = uuid.padEnd(64, '0');
  }

  return uuid;
}