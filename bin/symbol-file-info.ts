import { SymbolFile } from '@bugsplat/js-api-client';

export type SymbolFileInfo = Omit<SymbolFile, 'file'> & { file: string };