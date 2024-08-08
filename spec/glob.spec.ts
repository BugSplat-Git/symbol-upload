import { join } from "node:path";
import { globFiles } from "../src/glob";

describe('glob', () => {
    describe('globFiles', () => {
        it('should return result with directories filtered out', async () => {
            const supportDir = join(__dirname, 'support');
            const pattern = join(supportDir, '**', '*.dll');
            const files = await globFiles(pattern);
            expect(files).toEqual(
                jasmine.arrayContaining([
                    join(supportDir, 'bugsplat.dll'),
                    join(supportDir, 'symsrv', 'bugsplat.dll', '64FB82ED7A000', 'bugsplat.dll'),
                ])
            );
        });
    });
});