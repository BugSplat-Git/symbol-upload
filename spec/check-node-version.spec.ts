import { isPatchedNodeVersion } from '../scripts/check-node-version';

describe('isPatchedNodeVersion', () => {
  it.each([
    'v22.23.4',
    'v22.24.0',
    'v24.22.1',
    'v24.22.2',
    'v24.23.0',
    'v26.12.1',
    'v26.13.0',
    'v27.0.0',
  ])('should return true for patched version %s', (version) => {
    expect(isPatchedNodeVersion(version)).toBe(true);
  });

  it.each([
    'v22.12.0',
    'v22.23.3',
    'v24.19.0',
    'v24.21.0',
    'v24.22.0',
    'v26.12.0',
    'v23.11.0',
    'v25.0.0',
    'v20.19.0',
  ])('should return false for unpatched version %s', (version) => {
    expect(isPatchedNodeVersion(version)).toBe(false);
  });

  it('should accept versions without a leading v', () => {
    expect(isPatchedNodeVersion('24.22.1')).toBe(true);
  });

  it('should throw for unparseable versions', () => {
    expect(() => isPatchedNodeVersion('latest')).toThrow('Unable to parse Node.js version');
  });
});
