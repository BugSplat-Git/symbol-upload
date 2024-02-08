import { tryGetElfUUID } from "../src/elf";

describe('elf', () => {
    describe('tryGetElfUUID', () => {
        it('should return uuid for elf file', async () => {
            return expectAsync(tryGetElfUUID('spec/support/bugsplat.elf')).toBeResolvedTo('005f5f676d6f6e5f73746172745f5f006c696263');
        });
    });
});
