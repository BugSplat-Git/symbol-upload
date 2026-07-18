import { readFile } from 'node:fs/promises';

// Portable PDBs (the managed .NET Core / .NET 5+ debug format) are ECMA-335
// metadata blobs that begin with the ASCII magic "BSJB". They do not use the
// native MSF container that pdb-guid understands, so they need their own parser.
//
// The debug id is the 16-byte GUID stored at the start of the "#Pdb" stream.
// Symbol stores (per the SSQP key conventions used across the .NET ecosystem)
// key portable PDBs as <guid><age> where the age is always the sentinel
// 0xFFFFFFFF. This mirrors how native Windows PDBs are keyed as <guid><age>,
// keeping BugSplat symbol-store uploads consistent between the two formats.
// https://github.com/dotnet/symstore/blob/main/docs/specs/SSQP_Key_Conventions.md

const BSJB_SIGNATURE = 0x424a5342; // 'BSJB' read as a little-endian uint32
const PDB_STREAM_NAME = '#Pdb';
const PDB_ID_SIZE = 20; // 16-byte GUID followed by a 4-byte stamp
const GUID_SIZE = 16;
const PORTABLE_PDB_AGE = 'ffffffff';

export async function tryGetPortablePdbGuid(pdbFilePath: string): Promise<string> {
    const buffer = await readFile(pdbFilePath);
    return getPortablePdbGuid(buffer);
}

export function getPortablePdbGuid(buffer: Buffer): string {
    if (buffer.length < 4 || buffer.readUInt32LE(0) !== BSJB_SIGNATURE) {
        throw new Error('File is not a portable PDB (missing BSJB signature)');
    }

    const guidBytes = getPdbStreamGuidBytes(buffer);
    return formatPortablePdbGuid(guidBytes);
}

// Walk the ECMA-335 metadata root to locate the "#Pdb" stream and return the
// 16-byte GUID at its start. Layout (ECMA-335 II.24.2.1):
//   uint32 signature ('BSJB'), uint16 major, uint16 minor, uint32 reserved,
//   uint32 versionLength, byte[versionLength] version (4-byte aligned),
//   uint16 flags, uint16 streamCount,
//   streamCount x { uint32 offset, uint32 size, null-terminated ASCII name
//                   padded with \0 to the next 4-byte boundary }
function getPdbStreamGuidBytes(buffer: Buffer): Buffer {
    const versionLength = buffer.readUInt32LE(12);
    const streamCount = buffer.readUInt16LE(16 + versionLength + 2);

    let offset = 16 + versionLength + 4;
    for (let i = 0; i < streamCount; i++) {
        const streamOffset = buffer.readUInt32LE(offset);
        offset += 8; // skip stream offset (4) + size (4)

        const nameStart = offset;
        while (offset < buffer.length && buffer[offset] !== 0) {
            offset++;
        }
        const name = buffer.toString('ascii', nameStart, offset);
        // Advance past the name, its null terminator, and 4-byte alignment padding.
        offset = nameStart + align4(offset - nameStart + 1);

        if (name === PDB_STREAM_NAME) {
            if (streamOffset + PDB_ID_SIZE > buffer.length) {
                throw new Error('Portable PDB #Pdb stream is truncated');
            }
            return buffer.subarray(streamOffset, streamOffset + GUID_SIZE);
        }
    }

    throw new Error('Portable PDB is missing the #Pdb stream');
}

// Format the 16-byte GUID the same way native Windows PDB guids are formatted
// (mixed-endian .NET System.Guid layout rendered as 32 uppercase hex chars),
// then append the portable-PDB age sentinel.
function formatPortablePdbGuid(guidBytes: Buffer): string {
    const data1 = guidBytes.readUInt32LE(0).toString(16).padStart(8, '0');
    const data2 = guidBytes.readUInt16LE(4).toString(16).padStart(4, '0');
    const data3 = guidBytes.readUInt16LE(6).toString(16).padStart(4, '0');
    const data4 = Array.from(guidBytes.subarray(8, GUID_SIZE))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    return `${data1}${data2}${data3}${data4}${PORTABLE_PDB_AGE}`.toUpperCase();
}

function align4(value: number): number {
    return (value + 3) & ~3;
}
