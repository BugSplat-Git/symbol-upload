import { safeRemoveTmp } from '../src/tmp';

describe('tmp', () => {
    it('should retry removing tmp directory', async () => {
        let retried = false;
        const remover = jasmine.createSpy('remover').and.callFake(async () => {
            if (!retried) {
                retried = true;
                throw new Error('Failed to remove tmp directory!');
            }
        });

        await safeRemoveTmp(remover);

        expect(remover).toHaveBeenCalledTimes(2);
    });
});