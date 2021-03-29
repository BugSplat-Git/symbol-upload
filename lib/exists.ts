import fs from 'fs';

export function exists(file: string): boolean {
    try {
        fs.accessSync(file);
    } catch {
        return false;
    }

    return true;
}