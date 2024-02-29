import { tryGetElfUUID } from "../src/elf";

describe('elf', () => {
    describe('tryGetElfUUID', () => {
        it('should return uuid for elf file', async () => {
            return expectAsync(tryGetElfUUID('spec/support/bugsplat.elf')).toBeResolvedTo('85fe216fc7dd441f04c237310a56081fbf23c082');
        });
    });
});
