import { randomUUID } from 'crypto';
import { rm } from 'fs/promises';
import { join } from 'path';
import promiseRetry from 'promise-retry';

const uuid = randomUUID();
export const tmpDir = join(process.cwd(), `tmp-${uuid}`);

export async function safeRemoveTmp(remover = rm): Promise<void> {
  try {
    await promiseRetry(
      (retry) => remover(tmpDir, { recursive: true, force: true }).catch(retry),
      {
        minTimeout: 0, // First retry immediately
        maxTimeout: 2000, // Subsequent retries delay by 2 seconds
        factor: 2, // Exponential backoff
        retries: 4, // Try 4 times
      }
    );
  } catch (error) {
    console.error(`Could not delete ${tmpDir}!`, error);
  }
}
