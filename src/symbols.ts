import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { timer } from 'rxjs';
import util from 'util';
import { BugSplatApiClient } from './bugsplat-api-client';
import { S3ApiClient } from './s3-api-client';
import { exists } from './exists';

const stat = util.promisify(fs.stat);

export class Symbols {
    constructor(
        readonly database: string,
        readonly applicaton: string,
        readonly version: string,
        readonly files: Array<string>,
        private readonly _client: BugSplatApiClient
    ) { }

    async post(): Promise<any> {
        const promises = this.files
            .map(async (file) => {
                if (!exists(file)) {
                    throw new Error(`File does not exist at path: ${file}!`);
                }
                
                const stats = await stat(file);
                const size = stats.size;
                const name = path.basename(file);

                const presignedUrl = await this.getPresignedUrl(
                    this.database,
                    this.applicaton,
                    this.version,
                    size,
                    name,
                    this._client
                );

                const s3Client = new S3ApiClient();
                await s3Client.uploadFileToPresignedUrl(presignedUrl, file, size);

                return timer(1000).toPromise();
            });

        return Promise.all(promises);
    }

    private async getPresignedUrl(
        dbName: string,
        appName: string,
        appVersion: string,
        size: number,
        symFileName: string,
        client: BugSplatApiClient,
    ): Promise<string> {
        const route = '/api/symbols';
        const body = new FormData();
        body.append('dbName', dbName);
        body.append('appName', appName);
        body.append('appVersion', appVersion);
        body.append('size', size.toString());
        body.append('symFileName', symFileName);

        const response = await client.post(route, body);
        if (response.status !== 200) {
            throw new Error(`Error getting presignedUrl for ${symFileName}`);
        }

        const json = await response.json();
        return json.url;
    }
}