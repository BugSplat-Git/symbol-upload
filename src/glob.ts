import { glob } from "glob";

export async function globFiles(pattern: string): Promise<string[]> {
    return glob(pattern, { nodir: true });
}