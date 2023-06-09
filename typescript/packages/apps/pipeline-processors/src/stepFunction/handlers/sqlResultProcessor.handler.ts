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

import type { AwilixContainer } from 'awilix';
import type { FastifyInstance } from 'fastify';
import { buildLightApp } from '../../app.light';
import type { ProcessedTaskEvent, SqlResultProcessorTaskHandler } from '../tasks/model.js';
import type { SqlResultProcessorTask } from '../tasks/sqlResultProcessorTask.js';

const app: FastifyInstance = await buildLightApp();
const di: AwilixContainer = app.diContainer;

export const handler: SqlResultProcessorTaskHandler = async (event, _context, _callback): Promise<ProcessedTaskEvent[]> => {
	app.log.debug(`sqlResultProcessor > handler > event:${JSON.stringify(event)}`);
	const task = di.resolve<SqlResultProcessorTask>('sqlResultProcessorTask');
	const r = await task.process(event);
	app.log.debug(`resultProcessorLambda > handler > exit: ${JSON.stringify(r)}`);
	return r;
};
