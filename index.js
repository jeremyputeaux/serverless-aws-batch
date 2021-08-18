'use strict';

const BbPromise = require('bluebird');
const fse = require('fs-extra');
const generateCoreTemplate = require('./lib/generateCoreTemplate');
const ecr = require('./lib/ecr');
const docker = require('./lib/docker');
const batchenvironment = require('./lib/batchenvironment');
const batchtask = require('./lib/batchtask');
const awscli = require('./lib/awscli');
const _ = require('lodash');

BbPromise.promisifyAll(fse);

const importValueArraySchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      "Fn::ImportValue": {},
    },
    additionalProperties: false,
    required: ["Fn::ImportValue"],
  },
};

class ServerlessAWSBatch {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    serverless.configSchemaHandler.defineProvider("aws", {
      provider: {
        properties: {
          batch: {
            type: "object",
            properties: {
              Type: {
                type: "string",
              },
              SecurityGroupIds: importValueArraySchema,
              Subnets: importValueArraySchema,
              InstanceTypes: {
                type: "array",
                items: { type: "string" },
              },
              MinvCpus: {
                type: "integer",
              },
              MaxvCpus: {
                type: "integer",
              },
              Tags: {
                type: "object",
                additionalProperties: { type: "string" },
              },
            },
          },
        },
      },
    });

    serverless.configSchemaHandler.defineFunctionProperties("aws", {
      properties: {
        batch: {
          type: "object",
          properties: {
            ContainerProperties: {
              type: "object",
              properties: {
                Memory: {
                  type: "integer",
                },
                Vcpus: {
                  type: "integer",
                },
              },
            },
            RetryStrategy: {
              type: "object",
              properties: {
                Attempts: {
                  type: "integer",
                },
              },
            },
            Timeout: {
              type: "object",
              properties: {
                AttemptDurationSeconds: {
                  type: "integer",
                },
              },
            },
          },
        },
      },
    });

    // Make sure that we add the names for our ECR, docker, and batch resources to the provider
    _.merge(
      this.provider.naming,
      {
        'getECRLogicalId': ecr.getECRLogicalId,
        'getECRRepositoryName': ecr.getECRRepositoryName,
        'getECRRepositoryURL': ecr.getECRRepositoryURL,
        'getDockerImageName': docker.getDockerImageName,
        'getBatchServiceRoleLogicalId': batchenvironment.getBatchServiceRoleLogicalId,
        'getBatchInstanceManagementRoleLogicalId': batchenvironment.getBatchInstanceManagementRoleLogicalId,
        'getBatchInstanceManagementProfileLogicalId': batchenvironment.getBatchInstanceManagementProfileLogicalId,
        'getBatchSpotFleetManagementRoleLogicalId': batchenvironment.getBatchSpotFleetManagementRoleLogicalId,
        'getBatchJobExecutionRoleLogicalId': batchtask.getBatchJobExecutionRoleLogicalId,
        'getLambdaScheduleExecutionRoleLogicalId': batchenvironment.getLambdaScheduleExecutionRoleLogicalId,
        'getBatchComputeEnvironmentLogicalId': batchenvironment.getBatchComputeEnvironmentLogicalId,
        'getBatchJobQueueLogicalId': batchenvironment.getBatchJobQueueLogicalId,
        'getBatchJobQueueName': batchenvironment.getBatchJobQueueName,
        'getJobDefinitionLogicalId': batchtask.getJobDefinitionLogicalId
      }
    );

    // Define inner lifecycles
    this.commands = {}

    this.hooks = {
      'after:package:initialize': () => BbPromise.bind(this)
        .then(generateCoreTemplate.generateCoreTemplate),

      'before:package:compileFunctions': () => BbPromise.bind(this)
        .then(batchenvironment.validateAWSBatchServerlessConfig)
        .then(batchenvironment.generateAWSBatchTemplate)
        .then(batchtask.compileBatchTasks),

      'after:package:createDeploymentArtifacts': () => BbPromise.bind(this)
        .then(docker.buildDockerImage),

      'after:aws:deploy:deploy:updateStack': () => BbPromise.bind(this)
        .then(docker.pushDockerImageToECR),

      'before:remove:remove': () => BbPromise.bind(this)
        .then(awscli.deleteAllDockerImagesInECR)
    }
  }
}

module.exports = ServerlessAWSBatch;
