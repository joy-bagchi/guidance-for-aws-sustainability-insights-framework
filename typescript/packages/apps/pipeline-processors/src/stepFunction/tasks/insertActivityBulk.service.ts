/*
 *  Copyright Amazon.com Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import type { BaseLogger } from 'pino';
import { S3Client, HeadObjectCommand, PutObjectCommand, SelectObjectContentCommandInput, SelectObjectContentCommand } from '@aws-sdk/client-s3';
import { validateDefined, validateNotEmpty } from '@sif/validators';
import type { ActivitiesRepository } from '../../api/activities/repository.js';
import type { InsertActivityBulkEvent } from './model.js';
import type { Client } from 'pg';
import { toUtf8 } from '@aws-sdk/util-utf8-node';

export class InsertActivityBulkService {
	private readonly log: BaseLogger;
	private readonly activitiesRepository: ActivitiesRepository;
	private readonly s3Client: S3Client;
	private readonly bucket: string;
	private readonly bucketPrefix: string;

	public constructor(log: BaseLogger, activitiesRepository: ActivitiesRepository, s3Client: S3Client, bucket: string, bucketPrefix: string) {
		this.log = log;
		this.activitiesRepository = activitiesRepository;
		this.s3Client = s3Client;
		this.bucket = bucket;
		this.bucketPrefix = bucketPrefix;

	}

	public async process(event: InsertActivityBulkEvent): Promise<void> {
		this.log.info(`InsertActivityBulk> process> event: ${JSON.stringify(event)}`);

		validateDefined(event, 'event');

		const { pipelineId, executionId, sequence } = event;
		this.log.info(`InsertActivityBulk> process> pipelineId: ${pipelineId}, executionId: ${executionId}, sequence:${sequence}`);

		validateDefined(event, 'event');
		validateNotEmpty(pipelineId, 'pipelineId');
		validateNotEmpty(executionId, 'executionId');
		validateNotEmpty(sequence, 'sequence');

		// check if we have a duplicate event if so skip
		const isDuplicate = await this.isDuplicateRequest(event);
		if (isDuplicate) {
			this.log.info(`InsertActivityBulk> process> exit: duplicate event detected skip`)
		}
		await this.validateFilesExists(event);

		let status = 'success';
		let sharedDbConnection: Client;
		try {
			sharedDbConnection = await this.activitiesRepository.getConnection();
			// create the temporary tables
			await this.activitiesRepository.createTempTables(event, sharedDbConnection);

			// create the Activity Load statements to load data into the temporary tables
			await this.activitiesRepository.loadDataFromS3(event, this.bucket, sharedDbConnection);

			// start the transactional migration process
			await this.activitiesRepository.moveActivities(event, sharedDbConnection);
			await this.activitiesRepository.moveActivityValues(event, sharedDbConnection);

		} catch (Exception) {
			this.log.error(`InsertActivityBulk> process> error: ${JSON.stringify(Exception)}`);

			if ((Exception as Error).message === "Import from S3 failed, 0 rows were copied successfully") {

				// Check if activity file has any content if it does we return a failed status
				for await (let statement of this.validateFileHasContent(event)) {
					const statements = statement.split(`\n`).filter(o => o !== '');
					const firstStatement = Number(statements[0]);

					// fail if the activity file has any value record
					if (firstStatement > 0) {
						status = 'failed';
					}
				}
			} else {
				status = 'failed';
			}

		} finally {
			if (sharedDbConnection !== null) {
				sharedDbConnection.end();
			}

			// publish processing status
			const body = JSON.stringify({ pipelineId: event.pipelineId, executionId: event.executionId, sqlExecutionResult: status, activityValuesKey: event.activityValuesKey });
			const command = new PutObjectCommand({
				Bucket: this.bucket,
				Key: `${this.bucketPrefix}/${event.pipelineId}/executions/${event.executionId}/output/${event.sequence}.json`,
				Body: body
			});

			this.log.debug(`InsertActivityBulk> process> result: ${body}`);
			await this.s3Client.send(command);
		}
		this.log.info(`InsertActivityBulkTask> process> exit`);
	}

	private async validateFilesExists(event: InsertActivityBulkEvent) {
		this.log.debug(`InsertActivityBulk> validateFilesExists> in: ${JSON.stringify(event)}`);

		try {
			const activityValueResp = await this.s3Client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: `${event.activityValuesKey}` }));
			const activityValueSize = activityValueResp.ContentLength;

			if (activityValueSize < 0) {
				this.log.error(`InsertActivityBulk> validateFilesExists> error: file with keys : [${event.activityValuesKey}] is invalid`);
				throw new InvalidFileError(`file with keys : [${event.activityValuesKey}] is invalid`)
			}

		} catch (Exception) {
			if ((Exception as Error).name === "NotFound") {
				this.log.error(`InsertActivityBulk> validateFilesExists> error: file with keys : [${event.activityValuesKey}] not found`);
				throw new InvalidFileError(`file with keys : [${event.activityValuesKey}] is invalid`)
			} else {
				throw Exception;
			}
		}
		this.log.trace(`InsertActivityBulk> validateFilesExists> exit`);
		return;
	}

	private async isDuplicateRequest(event: InsertActivityBulkEvent): Promise<boolean> {
		this.log.trace(`InsertActivityBulk> isDuplicateRequest> in: ${JSON.stringify(event)}`);
		let isDuplicate = false;
		try {
			const previousExecutionResp = await this.s3Client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: `${this.bucketPrefix}/${event.pipelineId}/executions/${event.executionId}/output/${event.sequence}.json` }));
			const previousExecutionSize = previousExecutionResp.ContentLength;

			if (previousExecutionSize >= 0) {
				this.log.error(`InsertActivityBulk> isDuplicateRequest> error: sequence has already been processed, key exists: ${this.bucketPrefix}/${event.pipelineId}/executions/${event.executionId}/output/${event.sequence}.json`);
				isDuplicate = true;
			}

		} catch (Exception) {
			if ((Exception as Error).name === "NotFound") {
				this.log.trace(`InsertActivityBulk> isDuplicateRequest> no previous executions found continue`);
			}
		}
		this.log.trace(`InsertActivityBulk> isDuplicateRequest> exit`);
		return isDuplicate;
	}

	private async* validateFileHasContent(event: InsertActivityBulkEvent) {
		this.log.debug(`InsertActivityBulk> validateFileHasContent> in: ${JSON.stringify(event)}`);

		const s3Params: SelectObjectContentCommandInput = {
			Bucket: this.bucket,
			Key: `${event.activityValuesKey}`,
			ExpressionType: 'SQL',
			Expression: 'SELECT count(*) as c FROM s3object s Limit 5',
			InputSerialization: {
				CSV: {
					FileHeaderInfo: 'IGNORE',
					RecordDelimiter: '\n'
				},
				CompressionType: 'NONE',
			},
			OutputSerialization: {
				CSV: {
					RecordDelimiter: '\n',
				},
			},
			ScanRange: {
				Start: 0,
				End: 1000
			},
		};
		const result = await this.s3Client.send(new SelectObjectContentCommand(s3Params));

		if (result.Payload) {
			for await (const event of result.Payload) {
				if (event.Records?.Payload) {
					yield toUtf8(event.Records.Payload);
				}
			}
		}
		this.log.debug(`InsertActivityBulk> validateFileHasContent> result: ${JSON.stringify(result)}`);
	}
}



export class InvalidFileError extends Error {
	public constructor(message: string) {
		super(message);
		this.name = 'InvalidFileError';
	}
}
