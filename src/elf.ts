import { ElfFile } from 'elfy';

export async function tryGetElfUUID(path: string) {
    using elfFile = await ElfFile.create(path);
    let { success, section } = await elfFile.tryReadSection('.note.gnu.build-id');
    
    if (success) {
      return getUUID(section!);
    }
    
    ({ success, section } = await elfFile.tryReadSection('.sce_special'));
  
    if (success) {
      return getUUID(section!);
    }

    return '';
}

function getUUID(section: Buffer) {
    return section.subarray(0, 20).toString('hex');
}