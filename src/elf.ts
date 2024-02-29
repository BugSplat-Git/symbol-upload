import { ElfFile } from '@bugsplat/elfy';

export async function tryGetElfUUID(path: string) {
  let success: boolean, section: Buffer | undefined;

  // TODO BG use a using statement here when we move away from pkg and can use node 20+
  let elfFile = await ElfFile.create(path);
  try {
    ({ success, section } = await elfFile.tryReadSection('.note.gnu.build-id'));
  } finally {
    elfFile.dispose();
  }

  if (success) {
    return getUUID(section!);
  }

  elfFile = await ElfFile.create(path);
  try {
    ({ success, section } = await elfFile.tryReadSection('.sce_special'));
  } finally {
    elfFile.dispose();
  }

  if (success) {
    return getUUID(section!);
  }

  return '';
}

function getUUID(section: Buffer) {
  return section.subarray(0, 20).toString('hex');
}