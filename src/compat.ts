import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Get current file info compatible with both ESM and CommonJS/SEA environments
 */
export function getCurrentFileInfo(importMetaUrl?: string): { __filename: string; __dirname: string } {
    let __filename: string;
    let __dirname: string;

    // Check if we're in a CommonJS context (like SEA) where import.meta.url might be undefined
    const metaUrl = importMetaUrl || (typeof import.meta?.url === 'string' ? import.meta.url : undefined);
    
    if (metaUrl) {
        // ESM mode with valid import.meta.url
        __filename = fileURLToPath(metaUrl);
        __dirname = dirname(__filename);
    } else {
        // Fallback for CommonJS/SEA - use require.main or current working directory
        const path = require('path');
        const module = require('module');
        
        if (module._resolveFilename) {
            try {
                // Try to resolve the current module
                __filename = module._resolveFilename('src/compat', { paths: [process.cwd()] });
                __dirname = path.dirname(__filename);
            } catch {
                // Final fallback
                __filename = path.join(process.cwd(), 'src', 'compat.js');
                __dirname = path.join(process.cwd(), 'src');
            }
        } else {
            __filename = path.join(process.cwd(), 'src', 'compat.js');
            __dirname = path.join(process.cwd(), 'src');
        }
    }

    return { __filename, __dirname };
}

