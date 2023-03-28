import { ApiClient, UploadableFile } from "@bugsplat/js-api-client";

export async function postAndroidBinary(
    database: string,
    appName: string,
    appVersion: string,
    files: Array<FormDataFile>,
    bugsplat: ApiClient
): Promise<any> {
    const promises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('database', database);
        formData.append('appName', appName);
        formData.append('appVersion', appVersion);
        formData.append('file', file.file, file.name);
        const response = await bugsplat.fetch(
            `/post/android/symbols`,
            {
                method: 'POST',
                body: formData,
                duplex: 'half'
            } as any
        );
        if (response.status !== 202) {
            throw new Error(`Failed to upload Android binary ${file.name} error code ${response.status}`);
        }
        const json = await response.json();
        console.log((json as SuccessResponse).message);
    });

    return Promise.all(promises);
}

export interface FormDataFile extends Omit<UploadableFile, 'file'> {
    file: File | Blob;
}

interface SuccessResponse {
    message: string;
}