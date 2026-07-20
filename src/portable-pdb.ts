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
//   uint32 versionLength, byte[versionLength] version,
//   padding to next 4-byte boundary, uint16 flags, uint16 streamCount,
//   streamCount x { uint32 offset, uint32 size, null-terminated ASCII name
//                   padded with \0 to the next 4-byte boundary }
function getPdbStreamGuidBytes(buffer: Buffer): Buffer {
    if (buffer.length < 20) {
        throw new Error('Portable PDB metadata header is truncated');
    }

    const versionLength = buffer.readUInt32LE(12);
    // Version string is followed by padding to a 4-byte boundary before flags/streams.
    const headerAfterVersion = 16 + align4(versionLength);
    if (headerAfterVersion + 4 > buffer.length) {
        throw new Error('Portable PDB metadata header is truncated');
    }

    const streamCount = buffer.readUInt16LE(headerAfterVersion + 2);
    let offset = headerAfterVersion + 4;
    for (let i = 0; i < streamCount; i++) {
        if (offset + 8 > buffer.length) {
            throw new Error('Portable PDB stream header is truncated');
        }

        const streamOffset = buffer.readUInt32LE(offset);
        const streamSize = buffer.readUInt32LE(offset + 4);
        offset += 8;

        const nameStart = offset;
        while (offset < buffer.length && buffer[offset] !== 0) {
            offset++;
        }
        if (offset >= buffer.length) {
            throw new Error('Portable PDB stream name is truncated');
        }
        const name = buffer.toString('ascii', nameStart, offset);
        // Advance past the name, its null terminator, and 4-byte alignment padding.
        offset = nameStart + align4(offset - nameStart + 1);

        if (name === PDB_STREAM_NAME) {
            if (streamSize < PDB_ID_SIZE) {
                throw new Error('Portable PDB #Pdb stream is too small');
            }
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
