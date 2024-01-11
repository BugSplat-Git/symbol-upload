export type SymbolFileInfo = {
    path: string;
    relativePath: string;
    moduleName: string;
    dbgId: string;
    fat?: boolean;
}