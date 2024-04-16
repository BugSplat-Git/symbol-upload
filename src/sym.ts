import firstline from "firstline";

export async function getSymFileInfo(path: string): Promise<{ dbgId: string, moduleName: string }> {
    try {
        const firstLine = await firstline(path);
        const matches = Array.from(firstLine?.matchAll(/([0-9a-fA-F]{33,34})\s+(.*)$/gm));
        const dbgId = matches?.at(0)?.at(1) || '';
        const moduleNameWithExt = matches?.at(0)?.at(2) || '';
        const moduleName = removeIgnoredExtensions(moduleNameWithExt);
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

// The rust-minidump-stackwalker symbol lookup implementation removes some extensions from the module name for symbol lookups.
// This is a bit of a mystery and is subject to change when we learn more about how it works.
// For now, remove some module name extensions to satisfy the minidump-stackwalker symbol lookup.
function removeIgnoredExtensions(moduleName: string): string {
    // We've seen .pdb, .so, .so.0, and .so.6 in the module lookup
    const ignoredExtensions = [/\.pdb$/gm, /\.so\.?.*$/gm];

    if (ignoredExtensions.some((regex) => regex.test(moduleName))) {
        return moduleName;
    }

    return moduleName.split('.')[0];
}