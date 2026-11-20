import { dumpSymsImportError } from '../src/preload';

describe('dumpSymsImportError', () => {
    const cause = new Error("Cannot find module '../native/index.node'");

    it('should explain skipped install scripts when installed as a package', () => {
        const error = dumpSymsImportError(cause, false);

        expect(error.message).toMatch(/^Can't import dump_syms!/);
        expect(error.message).toContain('install script');
        expect(error.message).toContain('"trustedDependencies": ["node-dump-syms"]');
        expect(error.message).toContain('"onlyBuiltDependencies": ["node-dump-syms"]');
        expect(error.message).toContain('--ignore-scripts');
        expect(error.cause).toBe(cause);
    });

    it('should not blame the package manager in a single-executable build', () => {
        const error = dumpSymsImportError(cause, true);

        expect(error.message).toMatch(/^Can't import dump_syms!/);
        expect(error.message).not.toContain('install script');
        expect(error.message).toContain('https://docs.bugsplat.com/');
        expect(error.cause).toBe(cause);
    });
});
