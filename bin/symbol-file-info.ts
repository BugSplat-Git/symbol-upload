import { SymbolFile } from '@bugsplat/js-api-client';

export enum SymbolFileType {
    legacy = 'legacy',
    symsrv = 'symsrv',
}

export type SymbolFileInfo = Omit<Required<SymbolFile>, 'file'> & { file: string, type: SymbolFileType };