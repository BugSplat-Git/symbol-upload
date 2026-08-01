import { vi } from 'vitest';
import { terminateWorkerPool } from '../src/upload';

describe('upload', () => {
    describe('terminateWorkerPool', () => {
        it('should resolve when the pool was never used', async () => {
            await expect(terminateWorkerPool()).resolves.toBeUndefined();
        });

        it('should not reject if the pool fails to terminate', async () => {
            const terminator = vi.fn().mockRejectedValue(new Error('Failed to terminate pool!'));
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});

            await expect(terminateWorkerPool(terminator)).resolves.toBeUndefined();

            expect(error).toHaveBeenCalled();
            error.mockRestore();
        });
    });
});
