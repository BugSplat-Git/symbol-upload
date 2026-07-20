import { tryGetPdbGuid, tryGetPeGuid } from '../src/pdb';
import { getPortablePdbGuid, tryGetPortablePdbGuid } from '../src/portable-pdb';

describe('pdb', () => {
    describe('tryGetPdbGuid', () => {
        it('should return guid for c++ pdb', async () => {
            return expectAsync(tryGetPdbGuid('spec/support/bugsplat.pdb')).toBeResolvedTo('E546B55B6D214E86871B40AC35CD0D461');
        });

        it('should return guid for portable pdb', () => {
            return expectAsync(tryGetPdbGuid('spec/support/portable.pdb')).toBeResolvedTo('153A24FA52FF4C03813A890A535486B8FFFFFFFF');
        });

        it('should return empty guid for missing pdb', () => {
            return expectAsync(tryGetPdbGuid('spec/support/does-not-exist.pdb')).toBeResolvedTo('');
        });
    });

    describe('tryGetPortablePdbGuid', () => {
        it('should return guid + FFFFFFFF age for portable pdb', () => {
            return expectAsync(tryGetPortablePdbGuid('spec/support/portable.pdb')).toBeResolvedTo('153A24FA52FF4C03813A890A535486B8FFFFFFFF');
        });

        it('should reject a native pdb that is not portable', () => {
            return expectAsync(tryGetPortablePdbGuid('spec/support/bugsplat.pdb')).toBeRejected();
        });
    });

    describe('getPortablePdbGuid', () => {
        // GUID bytes in mixed-endian .NET layout for 01020304-0506-0708-090A-0B0C0D0E0F10
        const guidBytes = Buffer.from([
            0x04, 0x03, 0x02, 0x01, 0x06, 0x05, 0x08, 0x07,
            0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
        ]);
        const expectedGuid = '0102030405060708090A0B0C0D0E0F10FFFFFFFF';

        it('should parse when versionLength is not a multiple of 4', () => {
            // versionLength=5 requires 3 padding bytes before flags/streamCount (ECMA-335 II.24.2.1).
            const buffer = buildPortablePdb({ version: 'v1.0\0', streamSize: 20, guidBytes });
            expect(getPortablePdbGuid(buffer)).toEqual(expectedGuid);
        });

        it('should reject when #Pdb stream size is smaller than the PDB id', () => {
            const buffer = buildPortablePdb({ version: 'PDB v1.0\0\0\0\0', streamSize: 16, guidBytes });
            expect(() => getPortablePdbGuid(buffer)).toThrowError(/too small/);
        });
    });

    describe('tryGetPeGuid', () => {
        it('should return guid for c++ exe', () => {
            return expectAsync(tryGetPeGuid('spec/support/bssndrpt.exe')).toBeResolvedTo('64FB82D565000');
        });

        it('should return empty guid for unrecognized pe file', () => {
            return expectAsync(tryGetPeGuid('spec/support/corrupt.exe')).toBeResolvedTo('');
        });
    });
});

function align4(value: number): number {
    return (value + 3) & ~3;
}

// Minimal ECMA-335 metadata root with a single "#Pdb" stream for unit tests.
function buildPortablePdb(options: {
    version: string;
    streamSize: number;
    guidBytes: Buffer;
}): Buffer {
    const versionBytes = Buffer.from(options.version, 'ascii');
    const versionLength = versionBytes.length;
    const versionPaddedLength = align4(versionLength);

    // Stream name "#Pdb\0" padded to 4 bytes: 5 bytes -> pad to 8.
    const streamName = Buffer.from('#Pdb\0\0\0\0', 'ascii');
    const headerSize = 16 + versionPaddedLength + 4 + 8 + streamName.length;
    const streamDataOffset = headerSize;
    const streamData = Buffer.alloc(Math.max(options.streamSize, 20));
    options.guidBytes.copy(streamData, 0);

    const buffer = Buffer.alloc(streamDataOffset + streamData.length);
    buffer.writeUInt32LE(0x424a5342, 0); // BSJB
    buffer.writeUInt16LE(1, 4); // major
    buffer.writeUInt16LE(1, 6); // minor
    buffer.writeUInt32LE(0, 8); // reserved
    buffer.writeUInt32LE(versionLength, 12);
    versionBytes.copy(buffer, 16);
    // padding between version and flags is already zero-filled
    const afterVersion = 16 + versionPaddedLength;
    buffer.writeUInt16LE(0, afterVersion); // flags
    buffer.writeUInt16LE(1, afterVersion + 2); // stream count
    buffer.writeUInt32LE(streamDataOffset, afterVersion + 4); // stream offset
    buffer.writeUInt32LE(options.streamSize, afterVersion + 8); // stream size
    streamName.copy(buffer, afterVersion + 12);
    streamData.copy(buffer, streamDataOffset);
    return buffer;
}
