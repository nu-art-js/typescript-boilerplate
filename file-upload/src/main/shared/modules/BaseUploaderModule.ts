/*
 * Permissions management system, define access level for each of
 * your server apis, and restrict users by giving them access levels
 *
 * Copyright (C) 2020 Adam van der Kruk aka TacB0sS
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
	__stringify,
	BadImplementationException,
	Dispatcher,
	generateHex,
	Minute,
	Module,
	Queue
} from "@nu-art/ts-common";
import {
	BaseHttpModule_Class,
	BaseHttpRequest,
	ErrorResponse,
	HttpMethod,
	TS_Progress
} from "@nu-art/thunderstorm";

import {
	Api_GetUploadUrl,
	BaseUploaderFile,
	DB_Temp_File,
	TempSecureUrl
} from "../../shared/types";

const RequestKey_UploadUrl = 'get-upload-url';
const RequestKey_UploadFile = 'upload-file';

export enum FileStatus {
	ObtainingUrl   = "ObtainingUrl",
	UploadingFile  = "UploadingFile",
	// I can assume that in between I upload and I get
	// the push I'm processing the file in the be
	PostProcessing = "PostProcessing",
	Completed      = "Completed",
	Error          = "Error"
}

export type FileInfo = {
	status: FileStatus
	messageStatus?: string
	progress?: number
	name: string
	request?: BaseHttpRequest<any>
	file?: any
	tempDoc?: DB_Temp_File
};

export interface OnFileStatusChanged {
	__onFileStatusChanged: (id?: string) => void
}

export type Request_Uploader = {
	name: string
	mimeType: string
	key?: string
}

export type FilesToUpload = Request_Uploader & {
	// Unfortunately be doesnt know File and File doesnt map to ArrayBuffer
	file: any
}

type Config = {
	uploadQueueParallelCount?: number
}

export abstract class BaseUploaderModule_Class<HttpModule extends BaseHttpModule_Class,CustomConfig extends object = {}>
	extends Module<Config & CustomConfig> {
	protected files: { [id: string]: FileInfo } = {};
	private readonly uploadQueue: Queue = new Queue("File Uploader").setParallelCount(2);
	protected readonly dispatch_fileStatusChange = new Dispatcher<OnFileStatusChanged, '__onFileStatusChanged'>('__onFileStatusChanged');
	private httpModule: HttpModule;

	protected constructor(httpModule: HttpModule) {
		super();
		this.httpModule = httpModule;
	}

	init(){
		if (this.config.uploadQueueParallelCount)
			this.uploadQueue.setParallelCount(this.config.uploadQueueParallelCount);
	}

	protected async getSecuredUrls(
		body: BaseUploaderFile[],
		onError: (errorMessage: string) => void | Promise<void>
	): Promise<TempSecureUrl[] | undefined> {
		let response: TempSecureUrl[];
		try {
			response = await this
				.httpModule
				.createRequest<Api_GetUploadUrl>(HttpMethod.POST, RequestKey_UploadUrl)
				.setRelativeUrl('/v1/upload/get-url')
				.setJsonBody(body)
				.executeSync();
		} catch (e) {
			onError(e.debugMessage);
			return;
		}
		return response;
	}

	protected abstract subscribeToPush(toSubscribe: TempSecureUrl[]): Promise<void>

	getFileInfo<K extends keyof FileInfo>(id: string, key: K): FileInfo[K] | undefined {
		return this.files[id] && this.files[id][key];
	}

	getFullFileInfo(id: string): FileInfo | undefined {
		return this.files[id];
	}

	protected setFileInfo<K extends keyof FileInfo>(id: string, key: K, value: FileInfo[K]) {
		if (!this.files[id])
			throw new BadImplementationException(`Trying to set ${key} for non existent file with id: ${id}`);

		this.files[id][key] = value;
		this.dispatchFileStatusChange(id);
	}

	protected dispatchFileStatusChange(id?: string) {
		this.dispatch_fileStatusChange.dispatchModule([id]);
	}

	uploadImpl(files: FilesToUpload[]): BaseUploaderFile[] {
		const body: BaseUploaderFile[] = files.map(fileData => {
			const fileInfo: BaseUploaderFile = {
				name: fileData.name,
				mimeType: fileData.mimeType,
				feId: generateHex(32)
			};

			if (fileData.key)
				fileInfo.key = fileData.key;

			this.files[fileInfo.feId] = {
				file: fileData.file,
				status: FileStatus.ObtainingUrl,
				name: fileData.name
			};

			return fileInfo;
		});

		this
			.httpModule
			.createRequest<Api_GetUploadUrl>(HttpMethod.POST, RequestKey_UploadUrl)
			.setRelativeUrl('/v1/upload/get-url')
			.setJsonBody(body)
			.setOnError((request: BaseHttpRequest<any>, resError?: ErrorResponse) => {
				body.forEach(f => {
					this.setFileInfo(f.feId, "messageStatus", __stringify(resError?.debugMessage));
					this.setFileInfo(f.feId, "status", FileStatus.Error);
				});
			})
			.execute(async (response: TempSecureUrl[]) => {
				this.dispatchFileStatusChange();
				if (!response)
					return;

				await this.uploadFiles(response);
			});

		return body;
	}

	private uploadFiles = async (response: TempSecureUrl[]) => {
		// Subscribe
		await this.subscribeToPush(response);

		response.forEach(r => {
			this.uploadQueue.addItem(async () => {
				await this.uploadFile(r);
				//TODO: Probably need to set a timer here in case we dont get a push back (contingency)
			});
		});
	};

	private uploadFile = async (response: TempSecureUrl) => {
		const feId = response.tempDoc.feId;
		this.setFileInfo(feId, "status", FileStatus.UploadingFile);
		this.setFileInfo(feId, "tempDoc", response.tempDoc);
		const fileInfo = this.files[feId];
		if (!fileInfo)
			throw new BadImplementationException(`Missing file with id ${feId} and name: ${response.tempDoc.name}`);

		try {
			const request = this
				.httpModule
				.createRequest(HttpMethod.PUT, RequestKey_UploadFile)
				.setUrl(response.secureUrl)
				.setHeader('Content-Type', response.tempDoc.mimeType)
				.setTimeout(10 * Minute)
				.setBody(fileInfo.file)
				.setOnProgressListener((ev: TS_Progress) => {
					this.setFileInfo(feId, "progress", ev.loaded / ev.total);
				});

			this.setFileInfo(feId, "request", request);
			await request.executeSync();
			this.setFileInfo(feId, "status", FileStatus.PostProcessing);
		} catch (e) {
			this.logWarning('Uploading failed with error: ',e)
			this.setFileInfo(feId, "status", FileStatus.Error);
			this.setFileInfo(feId, "messageStatus", __stringify(e));
		} finally {
			delete this.files[feId].file
			this.setFileInfo(feId, "progress", undefined);
		}
	};
}


