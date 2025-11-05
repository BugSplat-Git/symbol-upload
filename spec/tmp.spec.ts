import { describe, it, expect, vi } from 'vitest';
import { safeRemoveTmp } from '../src/tmp.js';

describe('tmp', () => {
    it('should retry removing tmp directory', async () => {
        let retried = false;
        const remover = vi.fn().mockImplementation(async () => {
            if (!retried) {
                retried = true;
                throw new Error('Failed to remove tmp directory!');
            }
        });

        await safeRemoveTmp(remover);

        expect(remover).toHaveBeenCalledTimes(2);
    });
});
