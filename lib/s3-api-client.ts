import fs from 'fs';
import fetch from 'node-fetch';
import { exists } from './exists';

export class S3ApiClient {
    async uploadFileToPresignedUrl(presignedUrl: string, file: string, size: number): Promise<any> {
        if (!exists(file)) {
            throw new Error(`File does not exist at path: ${file}!`);
        }

        const response = await fetch(presignedUrl, {
            method: 'PUT',
            headers: {
                'content-type': 'application/octet-stream',
                'content-length': `${size}`
            },
            body: fs.createReadStream(file),
        });

        if (response.status !== 200) {
            throw new Error(`Error uploading ${file} to presignedUrl`);
        }

        return response;
    }
}