import firstline from "firstline";

export async function getSymFileInfo(path: string): Promise<{ dbgId: string, moduleName }> {
    try {
        const firstLine = await firstline(path);
        const dbgId = firstLine?.match(/[0-9a-fA-F]{33,34}/gm)?.[0] || '';
        const moduleName = firstLine?.split(' ')?.at(-1)?.replace('\r', '').replace('\n', '') || '';
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