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

import { Stack, StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { eventBusNameParameter } from '../shared/eventbus.construct.js';
import { NagSuppressions } from 'cdk-nag';
import { dataFabricInputConnectorFunctionNameParameter, dataFabricOutputConnectorFunctionNameParameter } from '../shared/ssm.construct.js';
import { bucketNameParameter } from '../shared/s3.construct.js';
import { customResourceProviderTokenParameter } from '../shared/deploymentHelper.construct.js';
import { DataFabricInputConnector } from './dataFabricInput.construct.js';
import { DataFabricOutputConnector } from './dataFabricOutput.construct.js';

export type DataFabricConnectorStackProperties = StackProps & {
	tenantId: string;
	environment: string;
	inputConnectorName: string;
	outputConnectorName: string;
	dataFabricRegion: string;
	dataFabricEventBusArn: string;
	idcEmail: string;
	idcUserId: string;
	dfSustainabilityRoleArn: string;
};

export class DataFabricConnectorStack extends Stack {
	constructor(scope: Construct, id: string, props: DataFabricConnectorStackProperties) {
		super(scope, id, props);

		// validation
		this.validateMandatoryParam(props, 'tenantId');
		this.validateMandatoryParam(props, 'environment');
		this.validateMandatoryParam(props, 'inputConnectorName');
		this.validateMandatoryParam(props, 'outputConnectorName');

		const eventBusName = StringParameter.fromStringParameterAttributes(this, 'eventBusName', {
			parameterName: eventBusNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;


		const dataFabricInputConnectorFunctionName = StringParameter.fromStringParameterAttributes(this, 'dataFabricInputConnectorFunctionName', {
			parameterName: dataFabricInputConnectorFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const dataFabricOutputConnectorFunctionName = StringParameter.fromStringParameterAttributes(this, 'dataFabricOutputConnectorFunctionName', {
			parameterName: dataFabricOutputConnectorFunctionNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const bucketName = StringParameter.fromStringParameterAttributes(this, 'bucketName', {
			parameterName: bucketNameParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const customResourceProviderToken = StringParameter.fromStringParameterAttributes(this, 'customResourceProviderToken', {
			parameterName: customResourceProviderTokenParameter(props.tenantId, props.environment),
			simpleName: false,
		}).stringValue;

		const bucketPrefix = 'pipelines';
		const dataFabricObjectPrefix = 'datafabric';

		new DataFabricInputConnector(this, 'DataFabricInputConnector', {
			tenantId: props.tenantId,
			environment: props.environment,
			connectorName: props.inputConnectorName,
			dataFabricRegion: props.dataFabricRegion,
			dataFabricEventBusArn: props.dataFabricEventBusArn,
			dfSustainabilityRoleArn: props.dfSustainabilityRoleArn,
			eventBusName,
			dataFabricInputConnectorFunctionName,
			bucketName,
			bucketPrefix,
			customResourceProviderToken,
		});

		new DataFabricOutputConnector(this, 'DataFabricOutputConnector', {
			tenantId: props.tenantId,
			environment: props.environment,
			connectorName: props.outputConnectorName,
			dataFabricEventBusArn: props.dataFabricEventBusArn,
			idcUserId: props.idcUserId,
			idcEmail: props.idcEmail,
			bucketName,
			dataFabricObjectPrefix,
			dataFabricOutputConnectorFunctionName,
			eventBusName,
			customResourceProviderToken,
			dfSustainabilityRoleArn: props.dfSustainabilityRoleArn,
			dataFabricRegion: props.dataFabricRegion,
		});

		NagSuppressions.addResourceSuppressionsByPath(this, [
				'/dataFabricConnector/LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8a/ServiceRole/Resource'
			],
			[
				{
					id: 'AwsSolutions-IAM4',
					appliesTo: ['Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'],
					reason: 'This policy attached to the role is generated by CDK.'

				},
				{
					id: 'AwsSolutions-IAM5',
					appliesTo: ['Resource::*'],
					reason: 'The resource condition in the IAM policy is generated by CDK, this only applies to logs:DeleteRetentionPolicy and logs:PutRetentionPolicy actions.'

				}],
			true);
	}

	private validateMandatoryParam(props: DataFabricConnectorStackProperties, name: string) {
		if (props[name] === undefined) {
			throw new Error(`${name} is required`);
		}
	}
}
