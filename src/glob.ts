import { stat } from "node:fs/promises";
import { fileExists } from "./fs";
import { glob } from "glob";

export async function globFiles(pattern: string): Promise<string[]> {
    const result = await glob(pattern);
    const files = [] as string[];

    for (const file of result) {
        if (await fileExists(file) && !(await stat(file)).isDirectory()) {
            files.push(file);
        }
    }

    return files;
}