import { SymbolFile } from '@bugsplat/js-api-client';

export enum SymbolFileType {
    legacy = 'legacy',
    symserv = 'symserv',
}

export type SymbolFileInfo = Omit<Required<SymbolFile>, 'file'> & { file: string, type: SymbolFileType };