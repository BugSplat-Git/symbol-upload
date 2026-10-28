// SEA binaries embed the Node.js runtime that builds them, so refuse to build on a release
// line or patch version that is missing the October 2026 security fixes (CVE-2026-111497 et al.).
const minimumPatchedVersions = {
  22: [22, 23, 4],
  24: [24, 22, 1],
  26: [26, 12, 1],
};
const newestKnownMajor = 26;

function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) {
    throw new Error(`Unable to parse Node.js version: ${version}`);
  }
  return match.slice(1, 4).map(Number);
}

function isPatchedNodeVersion(version) {
  const parsed = parseVersion(version);
  const [major] = parsed;

  if (major > newestKnownMajor) {
    return true;
  }

  const minimum = minimumPatchedVersions[major];
  if (!minimum) {
    return false;
  }

  for (let i = 0; i < 3; i++) {
    if (parsed[i] !== minimum[i]) {
      return parsed[i] > minimum[i];
    }
  }
  return true;
}

module.exports = { isPatchedNodeVersion, minimumPatchedVersions };

if (require.main === module) {
  if (!isPatchedNodeVersion(process.version)) {
    const supported = Object.values(minimumPatchedVersions)
      .map((v) => `>=${v.join('.')}`)
      .join(', ');
    console.error(`Node.js ${process.version} is missing security fixes. Use a patched release (${supported}).`);
    process.exit(1);
  }
  console.log(`Node.js ${process.version} includes the required security fixes.`);
}
