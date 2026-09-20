import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Keep unchanged files quiet, and never expose a partially written file to Vite. */
export async function writeChangedFile(file: string, content: string): Promise<boolean> {
  try {
    if (await readFile(file, "utf8") === content) return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, file);
    return true;
  } finally {
    await rm(temporary, { force: true });
  }
}
