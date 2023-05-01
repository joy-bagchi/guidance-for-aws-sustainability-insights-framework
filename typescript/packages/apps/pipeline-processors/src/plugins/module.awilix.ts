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

import { asFunction, asValue, Lifetime } from 'awilix';
import fp from 'fastify-plugin';
import pkg from 'aws-xray-sdk';

const { captureAWSv3Client } = pkg;
import type { FastifyInstance } from 'fastify';
import { Cradle, diContainer, FastifyAwilixOptions, fastifyAwilixPlugin } from '@fastify/awilix';
import type { MetadataBearer, RequestPresigningArguments } from '@aws-sdk/types';
import type { Client, Command } from '@aws-sdk/smithy-client';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { S3Client } from '@aws-sdk/client-s3';
import { SFNClient } from '@aws-sdk/client-sfn';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { EventPublisher, PIPELINE_PROCESSOR_EVENT_SOURCE } from '@sif/events';
import { BaseCradle, registerBaseAwilix } from '@sif/resource-api-base';
import { CalculatorClient, ConnectorClient, MetricClient, PipelineClient } from '@sif/clients';
import { DynamoDbUtils } from '@sif/dynamodb-utils';

import { PipelineProcessorsRepository } from '../api/executions/repository.js';
import { PipelineProcessorsService } from '../api/executions/service.js';
import { MetricAggregationTaskService } from '../stepFunction/tasks/metricAggregationTask.service.js';
import { CalculationTask } from '../stepFunction/tasks/calculationTask.js';
import { ResultProcessorTask } from '../stepFunction/tasks/resultProcessorTask.js';
import { EventProcessor } from '../events/event.processor.js';
import { VerifyTask } from '../stepFunction/tasks/verifyTask.js';
import { ActivityService } from '../api/activities/service.js';
import { MetricsService } from '../api/metrics/service.js';
import { MetricsRepository } from '../api/metrics/repository.js';
import { BaseRepositoryClient } from '../data/base.repository.js';
import { ActivitiesRepository } from '../api/activities/repository.js';
import { AggregationTaskAuroraRepository } from '../stepFunction/tasks/aggregationTask.aurora.repository.js';
import { PipelineAggregationTaskService } from '../stepFunction/tasks/pipelineAggregationTask.service.js';
import { ActivityAuditService } from '../api/activities/audits/service.js';
import { ConnectorUtility } from '../utils/connectorUtility.js';

import { SecurityScope, SecurityContext, convertGroupRolesToCognitoGroups } from '@sif/authz';
import type { LambdaRequestContext } from '@sif/clients';

const { BUCKET_NAME, BUCKET_PREFIX } = process.env;

export type GetSecurityContext = (executionId: string, role?: string, groupContextId?: string) => Promise<SecurityContext>
export type GetLambdaRequestContext = (sc: SecurityContext) => LambdaRequestContext
export type GetSignedUrl = <InputTypesUnion extends object, InputType extends InputTypesUnion, OutputType extends MetadataBearer = MetadataBearer>(
	client: Client<any, InputTypesUnion, MetadataBearer, any>,
	command: Command<InputType, OutputType, any, InputTypesUnion, MetadataBearer>,
	options?: RequestPresigningArguments
) => Promise<string>;


declare module '@fastify/awilix' {
	interface Cradle extends BaseCradle {
		aggregationTaskAuroraRepository: AggregationTaskAuroraRepository;
		aggregationTaskService: MetricAggregationTaskService;
		pipelineAggregationTaskService: PipelineAggregationTaskService;
		calculationTask: CalculationTask;
		calculatorClient: CalculatorClient;
		dynamoDbUtils: DynamoDbUtils;
		eventBridgeClient: EventBridgeClient;
		eventPublisher: EventPublisher;
		metricClient: MetricClient;
		outputTask: ResultProcessorTask;
		pipelineClient: PipelineClient;
		connectorClient: ConnectorClient;
		connectorUtility: ConnectorUtility;
		pipelineProcessorsRepository: PipelineProcessorsRepository;
		pipelineProcessorsService: PipelineProcessorsService;
		s3Client: S3Client;
		stepFunctionClient: SFNClient;
		eventProcessor: EventProcessor;
		verifyTask: VerifyTask;
		activityService: ActivityService;
		activitiesRepository: ActivitiesRepository;
		metricsService: MetricsService;
		metricsRepo: MetricsRepository;
		activityAuditService: ActivityAuditService;
		baseRepositoryClient: BaseRepositoryClient;
		getSecurityContext: GetSecurityContext;
		getLambdaRequestContext: GetLambdaRequestContext;
		getSignedUrl: GetSignedUrl;
	}
}

// factories for instantiation of 3rd party object

class EventBridgeClientFactory {
	public static create(region: string | undefined): EventBridgeClient {
		const eb = captureAWSv3Client(new EventBridgeClient({ region }));
		return eb;
	}
}

class S3ClientFactory {
	public static create(region: string | undefined): S3Client {
		const s3 = captureAWSv3Client(new S3Client({ region }));
		return s3;
	}
}

class StepFunctionClientFactory {
	public static create(region: string | undefined): SFNClient {
		const sfn = captureAWSv3Client(new SFNClient({ region }));
		return sfn;
	}
}

const getLambdaRequestContext: GetLambdaRequestContext = (securityContext: SecurityContext): LambdaRequestContext => {
	const { email, groupRoles, groupId } = securityContext;
	const requestContext: LambdaRequestContext = {
		authorizer: {
			claims: {
				email: email,
				'cognito:groups': convertGroupRolesToCognitoGroups(groupRoles),
				groupContextId: groupId,
			},
		},
	};
	return requestContext;
};


const registerContainer = (app?: FastifyInstance) => {
	const commonInjectionOptions = {
		lifetime: Lifetime.SINGLETON,
	};

	const taskParallelLimit = parseInt(process.env['TASK_PARALLEL_LIMIT']);
	const awsRegion = process.env['AWS_REGION'];
	const eventBusName = process.env['EVENT_BUS_NAME'];
	const tableName = process.env['TABLE_NAME'];
	const calculatorFunctionName = process.env['CALCULATOR_FUNCTION_NAME'];
	const pipelineFunctionName = process.env['PIPELINES_FUNCTION_NAME'];
	const chunkSize = parseInt(process.env['CHUNK_SIZE']);
	const sourceDataBucket = process.env['BUCKET_NAME'];
	const sourceDataBucketPrefix = process.env['BUCKET_PREFIX'];
	const workflowStateMachineArn = process.env['PIPELINE_JOB_STATE_MACHINE_ARN'];
	const inlineStateMachineArn = process.env['PIPELINE_INLINE_STATE_MACHINE_ARN'];
	const metricsTableName = process.env['METRICS_TABLE_NAME'];
	const rdsDBHost = process.env['RDS_PROXY_ENDPOINT'];
	const rdsTenantUsername = process.env['TENANT_USERNAME'];
	const rdsTenantDatabase = process.env['TENANT_DATABASE_NAME'];
	const nodeEnv = process.env['NODE_ENV'];
	const caCert = process.env['CA_CERT'];
	const csvInputConnectorName = process.env['CSV_INPUT_CONNECTOR_NAME'];

	diContainer.register({
		getSignedUrl: asValue(getSignedUrl),
		eventBridgeClient: asFunction(() => EventBridgeClientFactory.create(awsRegion), {
			...commonInjectionOptions,
		}),
		s3Client: asFunction(() => S3ClientFactory.create(awsRegion), {
			...commonInjectionOptions,
		}),
		stepFunctionClient: asFunction(() => StepFunctionClientFactory.create(awsRegion), {
			...commonInjectionOptions,
		}),
		baseRepositoryClient: asFunction(() => new BaseRepositoryClient(app.log, rdsDBHost, rdsTenantUsername, rdsTenantDatabase, nodeEnv, caCert), {
			...commonInjectionOptions,
		}),
		dynamoDbUtils: asFunction((container: Cradle) => new DynamoDbUtils(app.log, container.dynamoDBDocumentClient)),

		eventPublisher: asFunction((container: Cradle) => new EventPublisher(app.log, container.eventBridgeClient, eventBusName, PIPELINE_PROCESSOR_EVENT_SOURCE), {
			...commonInjectionOptions,
		}),
		pipelineProcessorsRepository: asFunction((container: Cradle) => new PipelineProcessorsRepository(app.log, container.dynamoDBDocumentClient, tableName), {
			...commonInjectionOptions,
		}),
		pipelineClient: asFunction((container: Cradle) => new PipelineClient(app.log, container.invoker, pipelineFunctionName), {
			...commonInjectionOptions,
		}),
		connectorClient: asFunction((container: Cradle) => new ConnectorClient(app.log, container.invoker, pipelineFunctionName), {
			...commonInjectionOptions,
		}),
		connectorUtility: asFunction((container: Cradle) => new ConnectorUtility(
			app.log,
			container.s3Client,
			container.getSignedUrl,
			container.eventPublisher,
			container.connectorClient,
			BUCKET_NAME as string,
			BUCKET_PREFIX as string,
			eventBusName,
			csvInputConnectorName
		), {
			...commonInjectionOptions
		}),
		pipelineProcessorsService: asFunction(
			(container: Cradle) =>
				new PipelineProcessorsService(
					app.log,
					container.authChecker,
					container.s3Client,
					container.getSignedUrl,
					container.pipelineProcessorsRepository,
					BUCKET_NAME as string,
					BUCKET_PREFIX as string,
					container.eventPublisher,
					container.pipelineClient,
					container.connectorUtility,
					container.getLambdaRequestContext,
					container.calculatorClient,
					container.stepFunctionClient,
					inlineStateMachineArn
				),
			{
				...commonInjectionOptions,
			}
		),
		calculatorClient: asFunction((container: Cradle) => new CalculatorClient(app.log, container.lambdaClient, calculatorFunctionName), {
			...commonInjectionOptions,
		}),
		eventProcessor: asFunction(
			(container: Cradle) =>
				new EventProcessor(app.log, container.stepFunctionClient, container.pipelineProcessorsService, container.getSecurityContext, container.connectorUtility, container.s3Client, workflowStateMachineArn, sourceDataBucket, sourceDataBucketPrefix, container.pipelineClient, container.getLambdaRequestContext),
			{
				...commonInjectionOptions,
			}
		),
		calculationTask: asFunction((container: Cradle) => new CalculationTask(app.log, container.pipelineProcessorsService, container.calculatorClient, container.getSecurityContext), {
			...commonInjectionOptions,
		}),

		verifyTask: asFunction((container: Cradle) => new VerifyTask(app.log, container.pipelineClient, container.pipelineProcessorsService, container.s3Client, container.getSecurityContext, chunkSize, container.getLambdaRequestContext), {
			...commonInjectionOptions,
		}),
		outputTask: asFunction((container: Cradle) => new ResultProcessorTask(app.log, container.getSecurityContext, container.pipelineProcessorsService, container.s3Client, sourceDataBucket, sourceDataBucketPrefix), {
			...commonInjectionOptions,
		}),
		metricClient: asFunction((container: Cradle) => new MetricClient(app.log, container.invoker, pipelineFunctionName), {
			...commonInjectionOptions,
		}),
		aggregationTaskAuroraRepository: asFunction((container: Cradle) => new AggregationTaskAuroraRepository(app.log, container.baseRepositoryClient), {
			...commonInjectionOptions,
		}),
		aggregationTaskService: asFunction((container: Cradle) => new MetricAggregationTaskService(app.log, container.metricClient, container.aggregationTaskAuroraRepository, container.metricsRepo, container.utils), {
			...commonInjectionOptions,
		}),
		pipelineAggregationTaskService: asFunction((container: Cradle) => new PipelineAggregationTaskService(app.log, container.activitiesRepository, container.pipelineProcessorsRepository, container.pipelineClient), {
			...commonInjectionOptions,
		}),
		activitiesRepository: asFunction(
			(container: Cradle) =>
				new ActivitiesRepository(app.log, container.baseRepositoryClient),
			{
				...commonInjectionOptions,
			}
		),
		activityService: asFunction((container: Cradle) => new ActivityService(app.log, container.activitiesRepository, container.authChecker, container.pipelineClient, container.pipelineProcessorsService), {
			...commonInjectionOptions,
		}),
		activityAuditService: asFunction((container: Cradle) => new ActivityAuditService(app.log, container.s3Client, sourceDataBucket, container.activitiesRepository, container.authChecker, taskParallelLimit), {
			...commonInjectionOptions,
		}),
		metricsRepo: asFunction((container: Cradle) => new MetricsRepository(app.log, container.dynamoDBDocumentClient, metricsTableName, container.dynamoDbUtils), {
			...commonInjectionOptions,
		}),
		metricsService: asFunction((container: Cradle) => new MetricsService(app.log, container.metricsRepo, container.authChecker, container.metricClient), {
			...commonInjectionOptions,
		}),
		getLambdaRequestContext: asValue(getLambdaRequestContext),
		// This function construct the lambda request context with reduced scope but can be extended
		getSecurityContext: asFunction((container: Cradle) => {
			const getContext = async (executionId: string, role?: SecurityScope, groupContextId?: string) => {
				if (!groupContextId) {
					const pipelineExecution = await container.pipelineProcessorsRepository.getById(executionId);
					groupContextId = pipelineExecution.groupContextId;
				}

				const securityContext = {
					email: 'sif-pipeline-execution',
					groupId: `${groupContextId}`,
					groupRoles: { [`${groupContextId}`]: role ?? SecurityScope.contributor },
				};
				return securityContext;
			};
			return getContext;
		}, {
			...commonInjectionOptions,
		}),
	});
};

export default fp<FastifyAwilixOptions>(async (app: FastifyInstance): Promise<void> => {
	// first register the DI plugin
	await app.register(fastifyAwilixPlugin, {
		disposeOnClose: true,
		disposeOnResponse: false,
	});

	registerBaseAwilix(app.log);

	registerContainer(app);
});

export { registerContainer };
