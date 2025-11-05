import { describe, it, expect } from 'vitest';
import { tryGetElfUUID } from "../src/elf.js";

describe('elf', () => {
    describe('tryGetElfUUID', () => {
        it('should return uuid for elf file', async () => {
            await expect(tryGetElfUUID('spec/support/bugsplat.elf')).resolves.toBe('85fe216fc7dd441f04c237310a56081fbf23c082');
        });
    });
});
