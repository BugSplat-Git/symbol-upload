import { stat } from "node:fs/promises";

export async function fileExists(path: string): Promise<boolean> {
    try {
        return !!(await stat(path));
    } catch {
        return false;
    }
}