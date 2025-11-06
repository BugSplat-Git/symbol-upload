#!/usr/bin/env node

/**
 * Post-build script to convert .js files to .cjs in the CJS output directory.
 * This script:
 * 1. Recursively finds all .js files in dist/cjs
 * 2. Renames them to .cjs
 * 3. Updates all require() statements and import paths to use .cjs extensions
 */

import { copyFile, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const currentDirectory = dirname(filename);
const cjsDir = join(currentDirectory, '..', 'dist', 'cjs');
const srcDir = join(currentDirectory, '..', 'src');

async function isDirectory(path) {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function findFiles(dir, extension, fileList = []) {
  const entries = await readdir(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const isDir = await isDirectory(fullPath);
    
    if (isDir) {
      await findFiles(fullPath, extension, fileList);
    } else if (entry.endsWith(extension)) {
      fileList.push(fullPath);
    }
  }
  
  return fileList;
}

async function updateRequireStatements(filePath, relativePathMap) {
  const content = await readFile(filePath, 'utf-8');
  const fileDir = dirname(filePath);
  let updatedContent = content;
  
  // Replace require() statements with .js extensions to .cjs for relative imports
  // Matches: require('./path.js'), require("../path.js")
  updatedContent = updatedContent.replace(
    /require\s*\(\s*['"](\.\.?\/[^'"]+\.js)['"]\s*\)/g,
    (match, importPath) => {
      const relativePath = importPath.replace(/\.js$/, '.cjs');
      return match.replace(importPath, relativePath);
    }
  );
  
  // Replace import() dynamic imports with .js extensions to .cjs for relative imports
  // Matches: import('./path.js'), import("../path.js")
  updatedContent = updatedContent.replace(
    /import\s*\(\s*['"](\.\.?\/[^'"]+\.js)['"]\s*\)/g,
    (match, importPath) => {
      const relativePath = importPath.replace(/\.js$/, '.cjs');
      return match.replace(importPath, relativePath);
    }
  );
  
  // Replace any other string references to relative .js files
  // This catches cases like '__dirname + "/path.js"' or similar patterns
  updatedContent = updatedContent.replace(
    /(['"])(\.\.?\/[^'"]+\.js)\1/g,
    (match, quote, importPath) => {
      // Check if this relative path exists in our map
      const resolvedPath = resolve(fileDir, importPath);
      if (relativePathMap.has(resolvedPath)) {
        const relativePath = importPath.replace(/\.js$/, '.cjs');
        return quote + relativePath + quote;
      }
      return match;
    }
  );
  
  return updatedContent;
}

async function main() {
  try {
    console.log('Finding .js files in dist/cjs...');
    const jsFiles = await findFiles(cjsDir, '.js');
    
    if (jsFiles.length === 0) {
      console.log('No .js files found in dist/cjs');
      // Still copy compat.cjs even if no .js files to process
      const compatSource = join(srcDir, 'compat.cjs');
      const compatDestDir = join(cjsDir, 'src');
      const compatDest = join(compatDestDir, 'compat.cjs');
      console.log('Copying hand-crafted compat.cjs to dist/cjs/src/compat.cjs...');
      await mkdir(compatDestDir, { recursive: true });
      await copyFile(compatSource, compatDest);
      console.log('Copied compat.cjs successfully');
      return;
    }
    
    console.log(`Found ${jsFiles.length} .js file(s)`);
    
    // Create a map of original absolute paths to new .cjs paths (for checking later)
    const relativePathMap = new Map();
    
    // First, rename all files and create the mapping
    for (const jsFile of jsFiles) {
      const cjsFile = jsFile.replace(/\.js$/, '.cjs');
      const relativeJs = relative(cjsDir, jsFile);
      const relativeCjs = relativeJs.replace(/\.js$/, '.cjs');
      console.log(`Renaming ${relativeJs} -> ${relativeCjs}`);
      await rename(jsFile, cjsFile);
      relativePathMap.set(jsFile, cjsFile);
    }
    
    // Then, update all require() and import() statements in all .cjs files
    console.log('Updating require() and import() statements...');
    const allCjsFiles = await findFiles(cjsDir, '.cjs');
    
    for (const cjsFile of allCjsFiles) {
      const updatedContent = await updateRequireStatements(cjsFile, relativePathMap);
      await writeFile(cjsFile, updatedContent, 'utf-8');
    }
    
    // Copy compat.cjs to dist/cjs/src/compat.cjs at the end, overwriting any TypeScript-built version
    const compatSource = join(srcDir, 'compat.cjs');
    const compatDestDir = join(cjsDir, 'src');
    const compatDest = join(compatDestDir, 'compat.cjs');
    console.log('Copying hand-crafted compat.cjs to dist/cjs/src/compat.cjs...');
    // Ensure destination directory exists
    await mkdir(compatDestDir, { recursive: true });
    await copyFile(compatSource, compatDest);
    console.log('Copied compat.cjs successfully');
    
    console.log('Conversion complete!');
  } catch (error) {
    console.error('Error during post-build conversion:', error);
    process.exit(1);
  }
}

main();
