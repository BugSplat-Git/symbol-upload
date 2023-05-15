import { lstat } from "fs/promises";

export async function pathIsDirectory(path: string): Promise<boolean> {
    return (await lstat(path)).isDirectory();
}
