import firstline from 'firstline';
import { basename } from 'node:path';

export async function getSymFileInfo(
  path: string
): Promise<{ dbgId: string; moduleName: string }> {
  try {
    const firstLine = await firstline(path);
    const matches = Array.from(
      firstLine?.matchAll(/([0-9a-fA-F]{33,34})\s+(.*)$/gm)
    );
    const dbgId = matches?.at(0)?.at(1) || '';
    const moduleNameWithExt = matches?.at(0)?.at(2) || '';
    const moduleName = getNormalizedSymModuleName(moduleNameWithExt);
    return {
      dbgId,
      moduleName,
    };
  } catch {
    console.log(`Could not get first line for ${path}, skipping...`);
    return {
      dbgId: '',
      moduleName: '',
    };
  }
}

// The rust-minidump-stackwalker symbol lookup implementation removes some extensions from the module name for symbol lookups.
// This is a bit of a mystery and is subject to change when we learn more about how it works.
// For now, normalize some module name extensions to satisfy the minidump-stackwalker symbol lookup.
// When building the path, the pattern is module/GUID/file.sym
export function getNormalizedSymModuleName(moduleName: string): string {
  // Remove the .dSYM and .debug portions for .dylib.dSYM, .app.dSYM, and .so.2.debug etc.
  const alwaysRemoveExtensions = ['.dsym', '.debug'];
  for (const extension of alwaysRemoveExtensions) {
    if (moduleName.toLowerCase().endsWith(extension)) {
      moduleName = moduleName.slice(0, -extension.length);
    }
  }

  // We've seen .pdb, .so, .so.0, and .so.6 in the module lookup, leave them alone
  const ignoredExtensions = [/\.pdb$/gm, /\.so\.?.*$/gm, /\.dylib$/gm];
  if (ignoredExtensions.some((regex) => regex.test(moduleName))) {
    return moduleName;
  }

  // Remove the remaining extensions
  const firstIndex = moduleName.indexOf('.');
  if (firstIndex !== -1) {
    moduleName = moduleName.slice(0, firstIndex);
  }

  return moduleName;
}

// The rust-minidump-stackwalker symbol lookup implementation removes some extensions from the sym file name for symbol lookups.
// This is a bit of a mystery and is subject to change when we learn more about how it works.
// For now, normalize some sym file names to satisfy the minidump-stackwalker symbol lookup.
// When building the path, the pattern is module/GUID/file.sym

export function getNormalizedSymFileName(path: string): string {
  let normalizedFileName = basename(path);

  // Remove the .dSYM and .debug portions for .dylib.dSYM, .app.dSYM, and .so.2.debug etc.
  const alwaysRemoveExtensions = ['.dsym', '.debug'];
  for (const extension of alwaysRemoveExtensions) {
    if (normalizedFileName.toLowerCase().endsWith(extension)) {
      normalizedFileName = normalizedFileName.slice(0, -extension.length);
    }
  }

  const isDsym = normalizedFileName.toLowerCase().endsWith('.dsym');
  if (isDsym) {
    normalizedFileName = normalizedFileName.slice(0, -5);
  }

  // We've seen .dylib.sym, .so.sym, .so.0.sym, and .so.6.sym in the sym file lookup, leave them alone
  const ignoredExtensions = [/\.dylib$/gm, /\.so\.?.*$/gm];
  if (ignoredExtensions.some((regex) => regex.test(normalizedFileName))) {
    return `${normalizedFileName}.sym`;
  }

  // Remove the remaining extensions
  const firstIndex = normalizedFileName.indexOf('.');
  if (firstIndex !== -1) {
    normalizedFileName = normalizedFileName.slice(0, firstIndex);
  }

  return `${normalizedFileName}.sym`;
}
