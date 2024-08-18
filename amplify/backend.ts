import { defineBackend, secret } from "@aws-amplify/backend";
import { Duration, Stack } from "aws-cdk-lib";
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  Cors,
  LambdaIntegration,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Effect, Policy, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
// import { storage } from "./storage/resource"
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
// import cdk to be able to use it when passing the accesstoken
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";



const backend = defineBackend({
  auth,
  data,
  // storage,
});

const apiStack = backend.createStack("api-stack");

const cognitoAuth = new CognitoUserPoolsAuthorizer(apiStack, "CognitoAuth", {
  cognitoUserPools: [backend.auth.resources.userPool],
});

const ecrRepo1 = ecr.Repository.fromRepositoryName(apiStack, 'Agents1', 'daas-agents-1');
const ecrRepo2 = ecr.Repository.fromRepositoryName(apiStack, 'Agents2', 'daas-agents-2');
const ecrRepo3 = ecr.Repository.fromRepositoryName(apiStack, 'Agents3', 'daas-agents-3');

const ecrRepositoryStreaming = ecr.Repository.fromRepositoryName(apiStack, 'Streaming', 'daas-streaming');

const myRestApi = new RestApi(apiStack, "RestApi", {
  deploy: true,
  defaultCorsPreflightOptions: {
    allowOrigins: ["*"], // Restrict this to domains you trust
    allowMethods: ["*"], // Specify only the methods you need to allow
    allowHeaders: ["*"], // Specify only the headers you need to allow
  },
});

const assesmentPath = myRestApi.root.addResource("assesment");
const verifyAuth = myRestApi.root.addResource("verify-auth");

const apiRestPolicy = new Policy(apiStack, "ApiRestPolicy", {
  statements: [
    new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["execute-api:Invoke"],
      resources: [
        `${myRestApi.arnForExecuteApi("verify-auth")}`,
        `${myRestApi.arnForExecuteApi("assesment")}`
      ]
    })
  ]
});

backend.auth.resources.authenticatedUserIamRole.attachInlinePolicy(
  apiRestPolicy
);
backend.auth.resources.unauthenticatedUserIamRole.attachInlinePolicy(
  apiRestPolicy
);
// used to invoke the assessment lambda function with event mode
const pythonLambdaCallAssessment = new lambda.Function(apiStack, "PythonLambda", {
  runtime: lambda.Runtime.PYTHON_3_10,
  code: lambda.Code.fromAsset("amplify/functions/python-function"),
  handler: "handler.lambda_handler",
  timeout: Duration.seconds(30),
});

const pythonLambdaAuthorizer = new lambda.Function(apiStack, "PythonLambdaAuthorizer", {
  runtime: lambda.Runtime.PYTHON_3_10,
  code: lambda.Code.fromAsset("amplify/functions/auth-verify"),
  handler: "handler.lambda_handler",
  timeout: Duration.seconds(30),
});

// simmilar to streaming function
const pythonLambdaAuthSimulate = new lambda.Function(apiStack, "PythonLambdaAuthSimulate", {
  runtime: lambda.Runtime.PYTHON_3_10,
  code: lambda.Code.fromAsset("amplify/functions/simulate-auth-verify"),
  handler: "handler.lambda_handler",
  environment: {
    REST_API_URL: myRestApi.url,
  },
  timeout: Duration.seconds(30),
});

// // will be invoked from the pythonLambda function
const pythonLambdaDockerAgents1 = new lambda.DockerImageFunction(apiStack, 'PythonLambdaDocker1', {
  code: lambda.DockerImageCode.fromEcr(ecrRepo1),
  timeout: Duration.seconds(900),
  memorySize: 3008,
  ephemeralStorageSize: cdk.Size.gibibytes(10)
});

const pythonLambdaDockerAgents2 = new lambda.DockerImageFunction(apiStack, 'PythonLambdaDocker2', {
  code: lambda.DockerImageCode.fromEcr(ecrRepo2),
  timeout: Duration.seconds(900),
  memorySize: 3008,
  ephemeralStorageSize: cdk.Size.gibibytes(10)
});

const pythonLambdaDockerAgents3 = new lambda.DockerImageFunction(apiStack, 'PythonLambdaDocker3', {
  code: lambda.DockerImageCode.fromEcr(ecrRepo3),
  timeout: Duration.seconds(900),
  memorySize: 3008,
  ephemeralStorageSize: cdk.Size.gibibytes(10)
});

// will be invoked from its function url, and it will invoke the pythonLambdaAuthorizer using the restapi url from environment variable
const pythonLambdaDockerStreamingBots = new lambda.DockerImageFunction(apiStack, 'PythonLambdaDockerStreaming', {
  code: lambda.DockerImageCode.fromEcr(ecrRepositoryStreaming),
  timeout: Duration.seconds(900),
  memorySize: 3008
});


pythonLambdaCallAssessment.addEnvironment("AGENTS_PART_1", pythonLambdaDockerAgents1.functionName);
pythonLambdaCallAssessment.addEnvironment("GRAPHQL_API_ID", backend.data.resources.graphqlApi.apiId);
// pythonLambdaCallAssessment.addEnvironment("S3_BUCKET_NAME", backend.storage.resources.bucket.bucketName);

pythonLambdaDockerAgents1.addEnvironment("AGENTS_PART_2", pythonLambdaDockerAgents2.functionName);
pythonLambdaDockerAgents1.addEnvironment("GRAPHQL_API_ID", backend.data.resources.graphqlApi.apiId);
// pythonLambdaDockerAgents1.addEnvironment("S3_BUCKET_NAME", backend.storage.resources.bucket.bucketName);


pythonLambdaDockerAgents2.addEnvironment("AGENTS_PART_3", pythonLambdaDockerAgents3.functionName);
pythonLambdaDockerAgents2.addEnvironment("GRAPHQL_API_ID", backend.data.resources.graphqlApi.apiId);
// pythonLambdaDockerAgents2.addEnvironment("S3_BUCKET_NAME", backend.storage.resources.bucket.bucketName);

pythonLambdaDockerAgents3.addEnvironment("GRAPHQL_API_ID", backend.data.resources.graphqlApi.apiId);
// pythonLambdaDockerAgents3.addEnvironment("S3_BUCKET_NAME", backend.storage.resources.bucket.bucketName);



pythonLambdaDockerAgents1.grantInvoke(pythonLambdaCallAssessment);
pythonLambdaDockerAgents2.grantInvoke(pythonLambdaDockerAgents1);
pythonLambdaDockerAgents3.grantInvoke(pythonLambdaDockerAgents2);

const table = new dynamodb.Table(apiStack, 'Table', {
  partitionKey: { name: 'SessionId', type: dynamodb.AttributeType.STRING },
});

table.grantFullAccess(pythonLambdaDockerStreamingBots);

const grapghqlPolicy = new PolicyStatement({
  actions: ["appsync:GraphQL", "appsync:GetGraphqlApi", "appsync:ListGraphqlApis", "appsync:ListTypes"],
  resources: ["*"]
});

pythonLambdaCallAssessment.addToRolePolicy(grapghqlPolicy);
pythonLambdaDockerAgents1.addToRolePolicy(grapghqlPolicy);
pythonLambdaDockerAgents2.addToRolePolicy(grapghqlPolicy);
pythonLambdaDockerAgents3.addToRolePolicy(grapghqlPolicy);
pythonLambdaDockerStreamingBots.addToRolePolicy(grapghqlPolicy);

const pythonLambdaCallAssessmentIntegration = new LambdaIntegration(pythonLambdaCallAssessment);
const pythonLambdaAuthorizerIntegration = new LambdaIntegration(pythonLambdaAuthorizer);

assesmentPath.addMethod("POST", pythonLambdaCallAssessmentIntegration, {
  authorizer: cognitoAuth,
  authorizationType: AuthorizationType.COGNITO,
});

verifyAuth.addMethod("GET", pythonLambdaAuthorizerIntegration, {
  authorizer: cognitoAuth,
  authorizationType: AuthorizationType.COGNITO,
});

const retrieveSecretsCommands = `secret_json=$(aws secretsmanager get-secret-value --secret-id daas-secrets)
OPENAI_API_KEY=$(echo "$secret_json" | jq -r '.SecretString | fromjson | .OPENAI_API_KEY')
TAVILY_API_KEY=$(echo "$secret_json" | jq -r '.SecretString | fromjson | .TAVILY_API_KEY')
LANGCHAIN_API_KEY=$(echo "$secret_json" | jq -r '.SecretString | fromjson | .LANGCHAIN_API_KEY')
LLAMACLOUD_API_KEY=$(echo "$secret_json" | jq -r '.SecretString | fromjson | .LLAMACLOUD_API_KEY')
export OPENAI_API_KEY=$OPENAI_API_KEY
export TAVILY_API_KEY=$TAVILY_API_KEY
export LANGCHAIN_API_KEY=$LANGCHAIN_API_KEY
export LLAMACLOUD_API_KEY=$LLAMACLOUD_API_KEY`;

const retrieveSecretsCommandsStreaming = `secret_json=$(aws secretsmanager get-secret-value --secret-id daas-secrets)
OPENAI_API_KEY=$(echo "$secret_json" | jq -r '.SecretString | fromjson | .OPENAI_API_KEY')
export OPENAI_API_KEY=$OPENAI_API_KEY
export GRAPHQL_API_ID=${backend.data.resources.graphqlApi.apiId}
export REST_API_URL=${myRestApi.url}`;

// new codebuild.GitHubSourceCredentials(apiStack, "test", {
//   accessToken: secretManager.secretValueFromJson("GITHUB_ACCESS_TOKEN")
// });

const codeBuildProjectAgent1 = new codebuild.Project(apiStack, 'Agent1DockerCodeBuild', {
  source: codebuild.Source.gitHub({
    owner: 'yusufemad04',
    repo: 'DAAS-AGENTS',
    branchOrRef: 'main',
    webhook: true
  }),
  environment: {
    buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
    computeType: codebuild.ComputeType.MEDIUM,
    privileged: true,
  },
  timeout: Duration.hours(1),
  buildSpec: codebuild.BuildSpec.fromObject({
    version: '0.2',
    phases: {
      pre_build: {
        commands: [
          retrieveSecretsCommands,
          `aws ecr get-login-password --region ${Stack.of(apiStack).region} | docker login --username AWS --password-stdin ${Stack.of(apiStack).account}.dkr.ecr.${Stack.of(apiStack).region}.amazonaws.com`
        ],

      },
      build: {
        commands: [
          `docker build -t agents -f Dockerfile.agent1 . --build-arg VAR1=$OPENAI_API_KEY --build-arg VAR2=$TAVILY_API_KEY --build-arg VAR3=$LANGCHAIN_API_KEY --build-arg VAR4=$LLAMACLOUD_API_KEY`,
          `docker tag agents:latest ${ecrRepo1.repositoryUri}:latest`,
          `docker push ${ecrRepo1.repositoryUri}:latest`,
          `aws lambda update-function-code --function-name ${pythonLambdaDockerAgents1.functionName} --image-uri ${ecrRepo1.repositoryUri}:latest --region ${Stack.of(apiStack).region}`
        ]
      }
    }
  })
});

const codeBuildProjectAgent2 = new codebuild.Project(apiStack, 'Agent2DockerCodeBuild', {
  source: codebuild.Source.gitHub({
    owner: 'yusufemad04',
    repo: 'DAAS-AGENTS',
    branchOrRef: 'main',
    webhook: true
  }),
  environment: {
    buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
    computeType: codebuild.ComputeType.MEDIUM,
    privileged: true,
  },
  timeout: Duration.hours(1),
  buildSpec: codebuild.BuildSpec.fromObject({
    version: '0.2',
    phases: {
      pre_build: {
        commands: [
          retrieveSecretsCommands,
          `aws ecr get-login-password --region ${Stack.of(apiStack).region} | docker login --username AWS --password-stdin ${Stack.of(apiStack).account}.dkr.ecr.${Stack.of(apiStack).region}.amazonaws.com`
        ],

      },
      build: {
        commands: [
          `docker build -t agents -f Dockerfile.agent2 . --build-arg VAR1=$OPENAI_API_KEY --build-arg VAR2=$TAVILY_API_KEY --build-arg VAR3=$LANGCHAIN_API_KEY --build-arg VAR4=$LLAMACLOUD_API_KEY`,
          `docker tag agents:latest ${ecrRepo2.repositoryUri}:latest`,
          `docker push ${ecrRepo2.repositoryUri}:latest`,
          `aws lambda update-function-code --function-name ${pythonLambdaDockerAgents2.functionName} --image-uri ${ecrRepo2.repositoryUri}:latest --region ${Stack.of(apiStack).region}`
        ]
      }
    }
  })
});

const codeBuildProjectAgent3 = new codebuild.Project(apiStack, 'Agent3DockerCodeBuild', {
  source: codebuild.Source.gitHub({
    owner: 'yusufemad04',
    repo: 'DAAS-AGENTS',
    branchOrRef: 'main',
    webhook: true
  }),
  environment: {
    buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
    computeType: codebuild.ComputeType.MEDIUM,
    privileged: true,
  },
  timeout: Duration.hours(1),
  buildSpec: codebuild.BuildSpec.fromObject({
    version: '0.2',
    phases: {
      pre_build: {
        commands: [
          retrieveSecretsCommands,
          `aws ecr get-login-password --region ${Stack.of(apiStack).region} | docker login --username AWS --password-stdin ${Stack.of(apiStack).account}.dkr.ecr.${Stack.of(apiStack).region}.amazonaws.com`
        ],

      },
      build: {
        commands: [
          `docker build -t agents -f Dockerfile.agent3 . --build-arg VAR1=$OPENAI_API_KEY --build-arg VAR2=$TAVILY_API_KEY --build-arg VAR3=$LANGCHAIN_API_KEY --build-arg VAR4=$LLAMACLOUD_API_KEY`,
          `docker tag agents:latest ${ecrRepo3.repositoryUri}:latest`,
          `docker push ${ecrRepo3.repositoryUri}:latest`,
          `aws lambda update-function-code --function-name ${pythonLambdaDockerAgents3.functionName} --image-uri ${ecrRepo3.repositoryUri}:latest --region ${Stack.of(apiStack).region}`
        ]
      }
    }
  })
});

const codeBuildProjectStreaming = new codebuild.Project(apiStack, 'DockerImageBuildStreaming', {
  source: codebuild.Source.gitHub({
    owner: 'yusufemad04',
    repo: 'DAAS-BOTS',
    branchOrRef: 'main',
    webhook: true
  }),
  environment: {
    buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
    computeType: codebuild.ComputeType.MEDIUM,
    privileged: true,
  },
  timeout: Duration.hours(1),
  buildSpec: codebuild.BuildSpec.fromObject({
    version: '0.2',
    phases: {
      pre_build: {
        commands: [
          retrieveSecretsCommandsStreaming,
          `aws ecr get-login-password --region ${Stack.of(apiStack).region} | docker login --username AWS --password-stdin ${Stack.of(apiStack).account}.dkr.ecr.${Stack.of(apiStack).region}.amazonaws.com`
        ],

      },
      build: {
        commands: [
          `docker build -t agents . --build-arg VAR1=$OPENAI_API_KEY --build-arg VAR2=$GRAPHQL_API_ID --build-arg VAR3=$REST_API_URL --build-arg VAR4=${table.tableName}`,
          `docker tag agents:latest ${ecrRepositoryStreaming.repositoryUri}:latest`,
          `docker push ${ecrRepositoryStreaming.repositoryUri}:latest`,
          `aws lambda update-function-code --function-name ${pythonLambdaDockerStreamingBots.functionName} --image-uri ${ecrRepositoryStreaming.repositoryUri}:latest --region ${Stack.of(apiStack).region}`
        ]
      }
    }
  })
});

ecrRepo1.grantPullPush(codeBuildProjectAgent1);
ecrRepo2.grantPullPush(codeBuildProjectAgent2);
ecrRepo3.grantPullPush(codeBuildProjectAgent3);
ecrRepositoryStreaming.grantPullPush(codeBuildProjectStreaming);

const lambdaPolicy = new PolicyStatement({
  actions: ['lambda:*'],
  resources: ['*'],
});

codeBuildProjectAgent1.addToRolePolicy(lambdaPolicy);
codeBuildProjectAgent2.addToRolePolicy(lambdaPolicy);
codeBuildProjectAgent3.addToRolePolicy(lambdaPolicy);
codeBuildProjectStreaming.addToRolePolicy(lambdaPolicy);

const basePermissions = new PolicyStatement({
  sid: 'BasePermissions',
  effect: Effect.ALLOW,
  actions: [
    'secretsmanager:*',
    'cloudformation:CreateChangeSet',
    'cloudformation:DescribeChangeSet',
    'cloudformation:DescribeStackResource',
    'cloudformation:DescribeStacks',
    'cloudformation:ExecuteChangeSet',
    'docdb-elastic:GetCluster',
    'docdb-elastic:ListClusters',
    'ec2:DescribeSecurityGroups',
    'ec2:DescribeSubnets',
    'ec2:DescribeVpcs',
    'kms:DescribeKey',
    'kms:ListAliases',
    'kms:ListKeys',
    'lambda:ListFunctions',
    'rds:DescribeDBClusters',
    'rds:DescribeDBInstances',
    'redshift:DescribeClusters',
    'redshift-serverless:ListWorkgroups',
    'redshift-serverless:GetNamespace',
    'tag:GetResources'
  ],
  resources: ['*'],
});

codeBuildProjectAgent1.addToRolePolicy(basePermissions);
codeBuildProjectAgent2.addToRolePolicy(basePermissions);
codeBuildProjectAgent3.addToRolePolicy(basePermissions);
codeBuildProjectStreaming.addToRolePolicy(basePermissions);

const lambdaPermissions = new PolicyStatement({
  sid: 'LambdaPermissions',
  effect: Effect.ALLOW,
  actions: [
    'lambda:AddPermission',
    'lambda:CreateFunction',
    'lambda:GetFunction',
    'lambda:InvokeFunction',
    'lambda:UpdateFunctionConfiguration'
  ],
  resources: ['arn:aws:lambda:*:*:function:SecretsManager*'],
});

codeBuildProjectAgent1.addToRolePolicy(lambdaPermissions);
codeBuildProjectAgent2.addToRolePolicy(lambdaPermissions);
codeBuildProjectAgent3.addToRolePolicy(lambdaPermissions);
codeBuildProjectStreaming.addToRolePolicy(lambdaPermissions);

const SARPermissions = new PolicyStatement({
  sid: 'SARPermissions',
  effect: Effect.ALLOW,
  actions: [
    'serverlessrepo:CreateCloudFormationChangeSet',
    'serverlessrepo:GetApplication'
  ],
  resources: ['arn:aws:serverlessrepo:*:*:applications/SecretsManager*'],
});

codeBuildProjectAgent1.addToRolePolicy(SARPermissions);
codeBuildProjectAgent2.addToRolePolicy(SARPermissions);
codeBuildProjectAgent3.addToRolePolicy(SARPermissions);
codeBuildProjectStreaming.addToRolePolicy(SARPermissions);

const s3Permissions = new PolicyStatement({
  sid: 'S3Permissions',
  effect: Effect.ALLOW,
  actions: ['s3:GetObject'],
  resources: [
    'arn:aws:s3:::awsserverlessrepo-changesets*',
    'arn:aws:s3:::secrets-manager-rotation-apps-*/*'
  ],
});

codeBuildProjectAgent1.addToRolePolicy(s3Permissions);
codeBuildProjectAgent2.addToRolePolicy(s3Permissions);
codeBuildProjectAgent3.addToRolePolicy(s3Permissions);
codeBuildProjectStreaming.addToRolePolicy(s3Permissions);

const streamFunctionUrl = pythonLambdaDockerStreamingBots.addFunctionUrl({
  authType: lambda.FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ['*'],
    allowedMethods: [lambda.HttpMethod.ALL],
    allowedHeaders: ['*'],
  },
  invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
});

backend.addOutput({
  custom: {
    API: {
      [myRestApi.restApiName]: {
        endpoint: myRestApi.url,
        region: Stack.of(myRestApi).region,
        apiName: myRestApi.restApiName,
      },
      "StreamFunctionUrl": {
        endpoint: streamFunctionUrl.url,
        region: Stack.of(myRestApi).region,
        apiName: "StreamFunctionUrl",
      },
    },
  },
});
