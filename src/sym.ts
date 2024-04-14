import firstline from "firstline";

export async function getSymFileInfo(path: string): Promise<{ dbgId: string, moduleName: string }> {
    try {
        const firstLine = await firstline(path);
        const matches = Array.from(firstLine?.matchAll(/([0-9a-fA-F]{33,34})\s+([^\.]*).*$/gm));
        const dbgId = matches?.at(0)?.at(1) || '';
        const moduleName = matches?.at(0)?.at(2) || '';
        return {
            dbgId,
            moduleName
        };
    } catch {
        console.log(`Could not get first line for ${path}, skipping...`);
        return {
            dbgId: '',
            moduleName: ''
        };
    }
}