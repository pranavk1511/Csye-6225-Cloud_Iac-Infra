const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const gcp = require("@pulumi/gcp");

const config = new pulumi.Config();
const vpcCidrBlock = config.getSecret('cidrBlock');
const mailgun = config.get('mailgun')


// Function to get the first N availability zones
function getFirstNAvailabilityZones(data, n) {
    return data.names.slice(0, n);
}

// Create a new VPC
const vpc = new aws.ec2.Vpc("myVPC", {
    cidrBlock: vpcCidrBlock,
    enableDnsHostnames: true,
    enableDnsSupport: true,
});

// Create an Internet Gateway
const internetGateway = new aws.ec2.InternetGateway("myInternetGateway", {
    vpcId: vpc.id,
});

// Query for the available Availability Zones
aws.getAvailabilityZones().then((data) => {
    const availabilityZones = getFirstNAvailabilityZones(data, 3); // Choose the first 3 AZs if available AZs are greater than 3

    const publicSubnets = [];
    const privateSubnets = [];

    for (let i = 0; i < availabilityZones.length; i++) {
        const az = availabilityZones[i];


        const publicSubnet = new aws.ec2.Subnet(`publicSubnet-${az}-${i}`, {
            vpcId: vpc.id,
            cidrBlock: `10.0.${i * 2}.0/24`,
            availabilityZone: az,
            mapPublicIpOnLaunch: true,
            tags: { Name: `publicSubnet-${az}-${i}` },
        });

        const privateSubnet = new aws.ec2.Subnet(`privateSubnet-${az}-${i}`, {
            vpcId: vpc.id,
            cidrBlock: `10.0.${i * 2 + 10}.0/24`,
            availabilityZone: az,
            tags: { Name: `privateSubnet-${az}-${i}` },
        });

        publicSubnets.push(publicSubnet.id);
        privateSubnets.push(privateSubnet.id);
    }

    // Create public route table and associate it with public subnets
    const publicRouteTable = new aws.ec2.RouteTable("publicRouteTable", {
        vpcId: vpc.id,
        tags: { Name: "publicRouteTable" },
    });
    for (let i = 0; i < publicSubnets.length; i++) {
        const subnetId = publicSubnets[i];
        const az = availabilityZones[i];

        const routeTableAssociation = new aws.ec2.RouteTableAssociation(`publicRouteTableAssociation-${az}-${i}`, {
            subnetId: subnetId,
            routeTableId: publicRouteTable.id,
        });
    }

    // Create private route table and associate it with private subnets
    const privateRouteTable = new aws.ec2.RouteTable("privateRouteTable", {
        vpcId: vpc.id,
        tags: { Name: "privateRouteTable" },
    });

    for (let i = 0; i < privateSubnets.length; i++) {
        const subnetId = privateSubnets[i];
        const az = availabilityZones[i];

        const routeTableAssociation = new aws.ec2.RouteTableAssociation(`privateRouteTableAssociation-${az}-${i}`, {
            subnetId: subnetId,
            routeTableId: privateRouteTable.id,
        });
    }

    // Create a public route in the public route table to the Internet Gateway
    const publicRoute = new aws.ec2.Route("publicRoute", {
        routeTableId: publicRouteTable.id,
        destinationCidrBlock: "0.0.0.0/0",
        gatewayId: internetGateway.id,
    });

    const loadBalancerSecurityGroup = new aws.ec2.SecurityGroup("loadBalancerSecurityGroup", {
        vpcId: vpc.id,
        ingress: [
            {
                protocol: "tcp",
                fromPort: 80,
                toPort: 80,
                cidrBlocks: ["0.0.0.0/0"],
            },
            {
                protocol: "tcp",
                fromPort: 443,
                toPort: 443,
                cidrBlocks: ["0.0.0.0/0"],
            },
        ],
        egress: [
            {
                protocol: "-1", // All
                fromPort: 0,
                toPort: 0,
                cidrBlocks: ["0.0.0.0/0"],
            },
        ],
        tags:{
            Name:"Pulumi Genertated Load Balancer "
        },
    });
    // Create an EC2 security group
    const ec2SecurityGroup = new aws.ec2.SecurityGroup("ApplicationSecurityGroup", {
        vpcId: vpc.id,
        ingress: [
            {
                protocol: "tcp",
                fromPort: 22,
                toPort: 22,
                securityGroups: [loadBalancerSecurityGroup.id] ,
            },
            {
                protocol: "tcp",
                fromPort: 3000,
                toPort: 3000,
                securityGroups: [loadBalancerSecurityGroup.id],
            }

        ],
        egress : [
            {
                protocol: "-1", // All
                fromPort: 0,
                toPort: 0,
                cidrBlocks: ["0.0.0.0/0"],
            }
        ]
    });


    const rdsSecurityGroup = new aws.ec2.SecurityGroup("rdsSecurityGroup", {
        description: "RDS security group",
        vpcId: vpc.id,
        ingress: [
          {
            protocol: "tcp",
            fromPort: 3306,
            toPort: 3306,
            securityGroups: [ec2SecurityGroup.id],
          },
        ],
        egress: [
          {
            protocol: "-1", // All
            fromPort: 0, 
            toPort: 0, 
            cidrBlocks: ["0.0.0.0/0"], 
          },  
        ],
      });


    const dbParameterGroup = new aws.rds.ParameterGroup("dbparametergroup", {
        family: "mysql8.0", // Adjust the family based on your database engine
        description: "Custom DB parameter group for CSYE6225 RDS instance",
        parameters: [
            {
                name: "character_set_server",
                value: "utf8mb4",
            },
            {
                name: "collation_server",
                value: "utf8mb4_general_ci",
            },
            // Add more parameters as needed for your specific configuration
        ],
    });
    

    const dbSubnetGroup = new aws.rds.SubnetGroup("dbSubnetGroup", {
        subnetIds: privateSubnets, // Use the array of private subnet IDs
        description: "DB Subnet Group for RDS instances",
        name: "my-db-subnet-group", // Replace with a meaningful name
    });

    const rdsInstance = new aws.rds.Instance("rdsinstance", {
        allocatedStorage: 20, // Adjust the storage size as needed
        engine: "mysql", // Replace with your database engine (e.g., "mysql", "mariadb", or "postgres")
        instanceClass: "db.t2.micro", // Choose the appropriate instance class
        name: "Assignment3",
        username: "root",
        password: "pranavkulkarni", // Replace with your secure password
        skipFinalSnapshot: true, // Change to true if you want to enable final snapshot
        publiclyAccessible: false,
        dbSubnetGroupName: dbSubnetGroup.name, // Replace with the name of your private subnet group
        parameterGroupName: dbParameterGroup.name, // Use the custom parameter group
        vpcSecurityGroupIds: [rdsSecurityGroup.id], // Attach the database security group
    });

// EC2 Role 
    let role = new aws.iam.Role("role", {
        assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Action: "sts:AssumeRole",
                Principal: {
                    Service: "ec2.amazonaws.com"
                },
                Effect: "Allow",
            }]
        })
    })
     
    // cloud watch 
    let policyAttachment = new aws.iam.RolePolicyAttachment("policyAttachment", {
        role: role.name,
        policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
    })
     
   // create profile  
    let instanceProfile = new aws.iam.InstanceProfile("myInstanceProfile", {
        role: role.name
    });


const domainName = "demo.pranavkulkarni.me"; 

const loadBalancer = new aws.lb.LoadBalancer("webAppLoadBalancer", {
    internal: false,
    enableDeletionProtection: false, // Set to true if you want to enable deletion protection
    securityGroups: [loadBalancerSecurityGroup.id],
    subnets: publicSubnets, // Use public subnets for the load balancer
    enableHttp2: true,
});

const route53Record = new aws.route53.Record(`${domainName}-record`, {
    name: domainName,
    type: "A",
    zoneId: "Z02305757Q1YWNITYCTM",  // Replace with your Route53 hosted zone ID
    aliases: [
        {
            name: loadBalancer.dnsName,
            zoneId: loadBalancer.zoneId,
            evaluateTargetHealth: true,
        },
    ],
});
// Load balancer security Group 

const topic = new aws.sns.Topic("sending-email", {
    displayName: "Topic-sending-email",
});


const base64UserData = pulumi.all([rdsInstance.address, topic.arn]).apply(([dbHost, snsTopicArn]) => {
    const userData = `#!/bin/bash
        cd /opt/csye6225
        rm /opt/csye6225/.env
        touch /opt/csye6225/.env
        sudo echo "DB_HOST=${dbHost}" >> /opt/csye6225/.env
        sudo echo "DB_USER=root" >> /opt/csye6225/.env
        sudo echo "DB_PASSWORD=pranavkulkarni" >> /opt/csye6225/.env
        sudo echo "DB_NAME=Assignment3" >> /opt/csye6225/.env
        sudo echo "PORT=3000" >> /opt/csye6225/.env
        sudo echo 'CSVPATH="/opt/csye6225/opt/users.csv" ' >> /opt/csye6225/.env
        sudo echo "region=us-east-1" >> /opt/csye6225/.env
        sudo echo "topicarn=${snsTopicArn}" >> /opt/csye6225/.env
        sudo cat /opt/csye6225/.env
        sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
            -a fetch-config \
            -m ec2 \
            -c file:/opt/csye6225/cloudwatch-config.json \
            -s
        sudo systemctl enable nodeserver
        sudo systemctl start nodeserver
        sudo systemctl restart nodeserver
        sudo systemctl status nodeserver
        sudo systemctl enable amazon-cloudwatch-agent
        sudo systemctl start amazon-cloudwatch-agent
    `;

    return Buffer.from(userData).toString('base64');
});


const launchTemplate = new aws.ec2.LaunchTemplate("webAppLaunchTemplate", {
    name:"webAppLaunchTemplate",
    imageId:"ami-007c5eed87ee09ce4",
    // imageId: "ami-02eb84780cf600edb", // Replace with your custom AMI ID
    instanceType: "t2.micro",
    keyName: config.get('awskey'), // Replace with your AWS key name
    associatePublicIpAddress: true,
    dependsOn:[rdsInstance],
    userData: base64UserData,
    iamInstanceProfile: {
        name: instanceProfile.name,
    }, // Use the existing IAM instance profile 
    blockDeviceMappings: [
        {
            deviceName: "/dev/xvda",
            ebs: {
                deleteOnTermination: true,
                volumeSize: 25,
                volumeType: "gp2",
            },
        },
    ],
    
    networkInterfaces: [
        {
            associatePublicIpAddress: true,
            deleteOnTermination: true,
            securityGroups: [ec2SecurityGroup.id],
        },
    ],
     
    tagSpecifications: [
        {
            resourceType: "instance",
            tags: {
                Name: "asg_launch_config",
            },
        },
    ],
});

const targetGroup = new aws.lb.TargetGroup("webAppTargetGroup", {
    port: 3000,
    protocol: "HTTP",
    vpcId: vpc.id,
    healthCheck: {
        path: "/healthz", // You might need to adjust this based on your application's health check endpoint
        port: 3000,
    }
});

// Auto Scaling Group
const autoScalingGroup = new aws.autoscaling.Group("webAppAutoScalingGroup", {
    name:"webAppAutoScalingGroup",
    cooldown: 60,
    launchTemplate: {
        id: launchTemplate.id,
        version: '$Latest',
    },
    minSize: 1,
    maxSize: 3,
    desiredCapacity: 1,
    vpcZoneIdentifiers: publicSubnets, // Use the public subnets for the Auto Scaling Group
    tags: [{ key: "Name", value: "WebAppInstance", propagateAtLaunch: true }],
    targetGroupArns: [targetGroup.arn]
}, { dependsOn: [launchTemplate] });

// Auto Scaling Policies
const scaleUpPolicy = new aws.autoscaling.Policy("scaleUpPolicy", {
    scalingAdjustment: 1,
    adjustmentType: "ChangeInCapacity",
    cooldown: 60,
    autoscalingGroupName: autoScalingGroup.name,
});

const scaleDownPolicy = new aws.autoscaling.Policy("scaleDownPolicy", {
    scalingAdjustment: -1,
    adjustmentType: "ChangeInCapacity",
    cooldown: 60,
    autoscalingGroupName: autoScalingGroup.name,
});


// Alarms for scaling 
const cpuUtilizationAlarmHigh = new aws.cloudwatch.MetricAlarm("cpuUtilizationAlarmHigh", {
    comparisonOperator: "GreaterThanThreshold",
    evaluationPeriods: 1,
    metricName: "CPUUtilization",
    namespace: "AWS/EC2",
    period: 60,
    threshold: 5,
    statistic: "Average",
    alarmActions: [scaleUpPolicy.arn],
    TreatMissingData: "notBreaching",
    dimensions: { AutoScalingGroupName: autoScalingGroup.name },
});
 
const cpuUtilizationAlarmLow = new aws.cloudwatch.MetricAlarm("cpuUtilizationAlarmLow", {
    comparisonOperator: "LessThanThreshold",
    evaluationPeriods: 1,
    metricName: "CPUUtilization",
    namespace: "AWS/EC2",
    period: 60,
    statistic: "Average",
    threshold: 3,
    alarmActions: [scaleDownPolicy.arn],
    TreatMissingData: "notBreaching",
    dimensions: { AutoScalingGroupName: autoScalingGroup.name },
});
// Application Load Balancer



const listener = new aws.lb.Listener("webAppListener", {
    loadBalancerArn: loadBalancer.arn,
    port: 443,
    protocol: "HTTPS",
    certificateArn:"arn:aws:acm:us-east-1:009251910612:certificate/a75434f8-21c6-4710-bc7d-8890110a20ca",
    defaultActions: [{
        type: "forward",
        targetGroupArn: targetGroup.arn,
    }],
},{ dependsOn: [targetGroup] });



 
 
const lambdaRole = new aws.iam.Role("LambdaFunctionRole", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Principal: {
                Service: ["lambda.amazonaws.com"],
            },
            Action: ["sts:AssumeRole"],
        }],
    }),
});



 
const lambdaPolicyArns = [
    "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
    "arn:aws:iam::aws:policy/AmazonS3FullAccess",
    "arn:aws:iam::aws:policy/AWSLambda_FullAccess",
    "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
];
 
// Attach each policy individually
const cloudWatchLogsAttachment = new aws.iam.RolePolicyAttachment("lambdaPolicy-CloudWatchLogs", {
    role: lambdaRole.name,
    policyArn: lambdaPolicyArns[0],
});
 
const s3FullAccessAttachment = new aws.iam.RolePolicyAttachment("lambdaPolicy-S3FullAccess", {
    role: lambdaRole.name,
    policyArn: lambdaPolicyArns[1],
});
 
const lambdaFullAccessAttachment = new aws.iam.RolePolicyAttachment("lambdaPolicy-LambdaFullAccess", {
    role: lambdaRole.name,
    policyArn: lambdaPolicyArns[2],
});
 
const dynamoDBFullAccessAttachment = new aws.iam.RolePolicyAttachment("lambdaPolicy-DynamoDBFullAccess", {
    role: lambdaRole.name,
    policyArn: lambdaPolicyArns[3],
});
 
;
// Creating an IAM policy for SNS access
const topicPolicy = new aws.iam.Policy("EC2-SNS-TopicAccessPolicy", {
    policy: {
        Version: "2012-10-17",
        Statement: [
            {
                Sid: "AllowEC2ToPublishToSNSTopic",
                Effect: "Allow",
                Action: ["sns:Publish", "sns:CreateTopic"],
                Resource: topic.arn,
            },
        ],
    },
    roles: [role.name],
});

const snsPublishPolicyAttachment = new aws.iam.RolePolicyAttachment("SNSPublishPolicyAttachment", {
    role: role.name,
    policyArn: topicPolicy.arn,
});


const s3Bucket = new aws.s3.Bucket("pranavBucket", {
    acl: "private", // You can change the ACL as needed (private, public-read, public-read-write, etc.)
    bucket: "pranav-bucket-1",
})
// Creating an S3 bucket object for Lambda code
const lambdaCode = new aws.s3.BucketObject("lambda-code", {
    bucket: s3Bucket.bucket,  // Use the bucket name from the S3 bucket
    key: "Serverless.zip",
    dependsOn: [s3Bucket],  // Specify the dependency on the S3 bucket
});

const gcsBucket = new gcp.storage.Bucket("gcsBucket", {
    name: "csye6225_demo_gcs_bucket",
    location: "us",
    forceDestroy: true,
    versioning: {
        enabled: true,
    },
});
// Create a Google Service Account
const googleServiceAccount = new gcp.serviceaccount.Account("googleServiceAccount", {
    accountId: "google-service-account",
    displayName: "Google Service Account",
});

// Create Access Key for the Google Service Account
const googleServiceAccountKey = new gcp.serviceaccount.Key("googleServiceAccountKey", {
    serviceAccountId: googleServiceAccount.accountId,
});


const bucketAccess = new gcp.storage.BucketIAMBinding("bucketAccess", {
    bucket: gcsBucket.name,
    role: "roles/storage.objectAdmin",
    members: [pulumi.interpolate`serviceAccount:${googleServiceAccount.email}`],
});

const base64EncodedPrivateKey = Buffer.from(googleServiceAccountKey.privateKey).toString("base64");

lambdaPolicyArns.forEach(policyArn => {
    new aws.iam.RolePolicyAttachment(`EC2_lambdaPolicy-${policyArn.split("/").pop()}`, {
        role: role.name,
        policyArn: policyArn,
    });
});

lambdaPolicyArns.forEach(policyArn => {
    new aws.iam.RolePolicyAttachment(`Function_lambdaPolicy-${policyArn.split("/").pop()}`, {
        role: lambdaRole.name,
        policyArn: policyArn,
    });
});

// Creating a Lambda function
const lambdaFunction = new aws.lambda.Function("LambdaFunction", {
    dependsOn: [s3Bucket],
    functionName: "emailVerify",
    role: lambdaRole.arn,
    runtime: "nodejs14.x", // Note: Updated to a valid Node.js runtime version
    handler: "index.handler",
    code:  lambdaCode,
    environment: {
        variables: {
            GCP_PRIVATE_KEY: googleServiceAccountKey.privateKey,
            GCS_BUCKET_NAME: gcsBucket.name,
            MAIL_GUN_API_KEY: mailgun
        },
    },
    timeout: 60, // Set the timeout to 60 seconds (1 minute)
});
 
const snsSubscription = new aws.sns.TopicSubscription(`SNSSubscription`, {
    topic: topic.arn,
    protocol: "lambda",
    endpoint: lambdaFunction.arn,
});
 
// Adding a dependency between the IAM policy and the SNS topic
const topicPolicyAttachment = new aws.iam.PolicyAttachment("topicPolicyAttachment", {
    policyArn: topicPolicy.arn,
    roles: [lambdaRole.name],
});


const lambdaPermission = new aws.lambda.Permission("with_sns", {
    statementId: "AllowExecutionFromSNS",
    action: "lambda:InvokeFunction",
    function: lambdaFunction.name,
    principal: "sns.amazonaws.com",
    sourceArn: topic.arn,
});



// Create a DynamoDB table
const dynamoDBTable = new aws.dynamodb.Table("dynamoDBTable", {
    name: "Csye6225_Demo_DynamoDB",
    attributes: [
      {
        name: "id",
        type: "S",
      },
      {
        name: "status",
        type: "S",
      },
      {
        name: "timestamp",
        type: "S",
      },
      {
        name: "email",
        type: "S",
      },
    ],
    hashKey: "id",
    rangeKey: "status",
    readCapacity: 5,
    writeCapacity: 5,
    globalSecondaryIndexes: [
      {
        name: "TimestampIndex",
        hashKey: "timestamp",
        rangeKey: "id",
        projectionType: "ALL",
        readCapacity: 5,
        writeCapacity: 5,
      },
      {
        name: "EmailIndex",
        hashKey: "email",
        rangeKey: "id",
        projectionType: "ALL",
        readCapacity: 5,
        writeCapacity: 5,
      },
    ],
  });
// Create an IAM policy for DynamoDB access
const dynamoDBPolicy = new aws.iam.Policy("DynamoDBAccessPolicy", {
    policy: {
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Action: [
                    "dynamodb:PutItem",
                    "dynamodb:GetItem",
                    "dynamodb:Query",  // Add other necessary actions
                ],
                Resource: dynamoDBTable.arn,
            },
        ],
    },
});

// Attach the DynamoDB policy to the Lambda execution role
const dynamoDBPolicyAttachment = new aws.iam.PolicyAttachment("DynamoDBPolicyAttachment", {
    policyArn: dynamoDBPolicy.arn,
    roles: [lambdaRole.name], 
    dependsOn: [dynamoDBTable] // Assuming lambdaRole is the execution role for your Lambda function
});





// Make sure the DynamoDB policy attachment has a dependency on the DynamoDB table

    // Export the VPC, subnet IDs, and EC2 instance ID
    exports.gcsBucketName = gcsBucket.name;
    exports.dynamoDBTableName = dynamoDBTable.name;
    exports.vpcId = vpc.id;
    exports.publicSubnetIds = publicSubnets;
    exports.privateSubnetIds = privateSubnets;
    exports.rdsEndpoint = rdsInstance.endpoint;
    exports.route53Record = route53Record.id;
    exports.dynamoDBTableName = dynamoDBTable.name;
    exports.googleServiceAccountKey = googleServiceAccountKey.privateKey;
    exports.googleServiceAccountEmail = googleServiceAccount.email;
    
});