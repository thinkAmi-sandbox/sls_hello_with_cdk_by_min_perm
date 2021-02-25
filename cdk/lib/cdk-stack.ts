import * as cdk from '@aws-cdk/core';
import IAM = require('@aws-cdk/aws-iam')
import { Effect } from '@aws-cdk/aws-iam';

// Serverless Frameworkのプロジェクトとステージ
const PROJECT = 'hello-sls'
const STAGE = '*'  // どのステージにも適用できるようにした(必要に応じて、ステージを分ける)


export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const cfnRole = this.createRoleForCfn();
    const deployRole = this.createRoleForDeployUser(cfnRole);
    this.createGroupOfDeployUser(deployRole);
  }

  // CFnでリソースを操作するロールを作成
  createRoleForCfn(): IAM.Role {
    const statements = [];

    // Serverless FrameworkがLambda用Roleを作るときに、権限を渡してあげる
    statements.push(new IAM.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'iam:PassRole'
      ],
      resources: [
        `arn:aws:iam::${this.account}:role/${PROJECT}-${STAGE}-${this.region}-lambdaRole`
      ]
    }));

    // CFnがS3からデータを取得できるようにする
    statements.push(new IAM.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        's3:*'
      ],
      resources: [
        `arn:aws:s3:::${PROJECT}-${STAGE}`,
        `arn:aws:s3:::${PROJECT}-${STAGE}/`,
      ]
    }));

    statements.push(new IAM.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        's3:ListAllMyBuckets',
        's3:CreateBucket',
      ],
      resources: [
        '*'
      ]
    }));

    // API Gatewayまわりの権限
    statements.push(new IAM.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'apigateway:GET',
        'apigateway:PATCH',
        'apigateway:POST',
        'apigateway:PUT',
        'apigateway:DELETE'
      ],
      resources: [
        `arn:aws:apigateway:${this.region}::/restapis`,
        `arn:aws:apigateway:${this.region}::/restapis/*`
      ]
    }));

    // Lambdaがログを出力する先であるCloudWatchまわりの権限
    statements.push(new IAM.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'logs:DescribeLogGroups',
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group::log-stream:*`
      ]
    }));

    statements.push(new IAM.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:DeleteLogGroup',
        'logs:DeleteLogStream',
        'logs:DescribeLogStreams',
        'logs:FilterLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${PROJECT}-${STAGE}:log-stream:*`
      ]
    }));

    // Serverless FrameworkがLambda用ロールを扱えるようにするための権限
    statements.push(new IAM.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "iam:GetRole",
        "iam:GetRolePolicy",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:DeleteRolePolicy",
        "iam:PutRolePolicy"
      ],
      resources: [
        `arn:aws:iam::${this.account}:role/${PROJECT}-${STAGE}-${this.region}-lambdaRole`
      ]
    }));

    // Lambdaまわりの権限
    statements.push(new IAM.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'lambda:GetFunction',
        'lambda:CreateFunction',
        'lambda:DeleteFunction',
        'lambda:UpdateFunctionConfiguration',
        'lambda:UpdateFunctionCode',
        'lambda:ListVersionsByFunction',
        'lambda:PublishVersion',
        'lambda:CreateAlias',
        'lambda:DeleteAlias',
        'lambda:UpdateAlias',
        'lambda:GetFunctionConfiguration',
        'lambda:AddPermission',
        'lambda:RemovePermission',
        'lambda:InvokeFunction'
      ],
      resources: [
        `arn:aws:lambda:${this.region}:${this.account}:function:${PROJECT}-${STAGE}`
      ]
    }));

    // ユーザ管理ポリシーとして作成
    const cfnPolicy = new IAM.ManagedPolicy(
      this,
      'thinkAmiCfnPolicy',
      {
        managedPolicyName: 'thinkAmi-Serverless-CFn',
        statements: statements
      }
    );

    // CFn用ロールとして作成
    return new IAM.Role(
      this,
      'thinkAmiCfnRole',
      {
        roleName: 'thinkAmi-Serverless-CFn-Role',
        assumedBy: new IAM.ServicePrincipal('cloudformation.amazonaws.com'),
        managedPolicies: [
          cfnPolicy
        ]
      }
    );
  }


  // Serverless FrameworkでAWSリソースを扱うためのロールを作成
  createRoleForDeployUser(cfnRole: IAM.Role): IAM.Role {
    const statements = []

    // CFnでのリソース作成をCFn用ロールにPassRoleする権限
    statements.push(new IAM.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'iam:PassRole',
      ],
      resources: [
        cfnRole.roleArn
      ]
    }));

    // S3を使ってデプロイするための権限
    statements.push(new IAM.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        's3:*',
      ],
      resources: [
        `arn:aws:s3:::${PROJECT}-${STAGE}`,
        `arn:aws:s3:::${PROJECT}-${STAGE}/*`
      ]
    }));

    statements.push(new IAM.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        's3:ListAllMyBuckets',
        's3:CreateBucket'
      ],
      resources: [
        '*'
      ]
    }));

    // CFnを扱うための権限
    statements.push(new IAM.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'cloudformation:CreateStack',
        'cloudformation:UpdateStack',
        'cloudformation:DeleteStack'
      ],
      resources: [
        `arn:aws:cloudformation:${this.region}:${this.account}:stack/${PROJECT}-${STAGE}/*`
      ]
    }));

    statements.push(new IAM.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'cloudformation:Describe*',
        'cloudformation:List*',
        'cloudformation:Get*',
        'cloudformation:ValidateTemplate'
      ],
      resources: [
        '*'
      ]
    }));

    // Paramter Storeから値を取得する権限
    // serverless.yml中のdeploymentRoleにて指定するARNをParamter Storeに設定する
    statements.push(new IAM.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'ssm:GetParameter'
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/hello-sls/CFn-Role`
      ]
    }));


    // ユーザ管理ポリシーとして作成
    const deployPolicy = new IAM.ManagedPolicy(
      this,
      'thinkAmiDeployPolicy',
      {
        managedPolicyName: 'thinkAmi-Serverless-Deploy',
        statements: statements
      }
    );

    // デプロイするユーザ用ロールとして作成
    return new IAM.Role(
      this,
      'thinkAmiDeployRole',
      {
        roleName: 'thinkAmi-Serverless-Deploy-Role',
        assumedBy: new IAM.AccountPrincipal(this.account),
        managedPolicies: [deployPolicy]
      }
    );
  }


  // Deployするユーザが所属するグループを作成
  // Serverless FrameworkでAWSリソースを扱うためのロールをAssumeRoleできる権限を、このグループに割り当てる
  createGroupOfDeployUser(deployRole: IAM.Role) {
    const statements = [];

    // AssumeRoleする権限
    statements.push(new IAM.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        'sts:AssumeRole'
      ],
      resources: [
        deployRole.roleArn
      ]
    }));

    // ユーザ管理ポリシーとして作成
    const assumePolicy = new IAM.ManagedPolicy(
      this,
      'thinkAmiAssumePolicy',
      {
        managedPolicyName: 'thinkAmi-Serverless-Assume-By-User',
        statements: statements
      }
    );

    // グループに割り当て
    new IAM.Group(
      this,
      'thinkAmiAssumeGroup',
      {
        groupName: 'thinkAmi-Serverless-Assume',
        managedPolicies:[assumePolicy]
      }
    );
  }
}
