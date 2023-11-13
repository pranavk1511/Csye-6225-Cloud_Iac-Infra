const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");


const config = new pulumi.Config();
const vpcCidrBlock = config.getSecret('cidrBlock');
const dbPassword = config.get('dbpassword'); 
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
     
     
    let policyAttachment = new aws.iam.RolePolicyAttachment("policyAttachment", {
        role: role.name,
        policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
    })
     
    let instanceProfile = new aws.iam.InstanceProfile("myInstanceProfile", {
        role: role.name
    });





// Create an EC2 instance
// const ec2Instance = new aws.ec2.Instance("ec2Instance", {
//         ami: "ami-00ea6dcd40e40ccba", // Replace with your desired AMI ID
//         instanceType: "t2.micro",
//         subnetId: publicSubnets[0], // Launch in the first public subnet
//         vpcSecurityGroupIds: [ec2SecurityGroup.id],
//         keyName: config.get('awskey'), // Replace with your key pair name
//         rootBlockDevice: {
//             volumeSize: 25, // Set the root volume size to 25 GB
//             volumeType: "gp2", // Set the root volume type to General Purpose SSD (GP2)
//             deleteOnTermination: true,

//         },
//         tags: {
//             Name: "MyEC2Instance",
//         },
//         dependsOn:[rdsInstance],
//         iamInstanceProfile: instanceProfile.name,
//         userDataReplaceOnChange:true,
//         userData:pulumi.interpolate`#!/bin/bash
//         cd /opt/csye6225
//         rm /opt/csye6225/.env
//         touch /opt/csye6225/.env
// sudo echo "DB_HOST=${rdsInstance.address}" >> /opt/csye6225/.env
// sudo echo "DB_USER=root" >> /opt/csye6225/.env
// sudo echo "DB_PASSWORD=${dbPassword}" >> /opt/csye6225/.env
// sudo echo "DB_NAME=Assignment3" >> /opt/csye6225/.env
// sudo echo "PORT=3000" >> /opt/csye6225/.env
// sudo echo "CSVPATH="/opt/csye6225/opt/users.csv" " >> /opt/csye6225/.env
// sudo cat /opt/csye6225/.env
// sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
//     -a fetch-config \
//     -m ec2 \
//     -c file:/opt/csye6225/cloudwatch-config.json \
//     -s
// sudo systemctl enable nodeserver
// sudo systemctl start nodeserver
// sudo systemctl restart nodeserver
// sudo systemctl status nodeserver
// sudo systemctl enable amazon-cloudwatch-agent
// sudo systemctl start amazon-cloudwatch-agent
// `,
// });

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

const base64UserData = pulumi.output(rdsInstance.address).apply(dbHost => {
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
    imageId: "ami-0ce4974d96bf64e34", // Replace with your custom AMI ID
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
    cooldown: 60,
    launchTemplate: {
        id: launchTemplate.id,
        version: launchTemplate.latestVersion,
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
    dimensions: { AutoScalingGroupName: asg.name },
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
    dimensions: { AutoScalingGroupName: asg.name },
});
// Application Load Balancer



const listener = new aws.lb.Listener("webAppListener", {
    loadBalancerArn: loadBalancer.arn,
    port: 80,
    protocol: "HTTP",
    defaultActions: [{
        type: "forward",
        targetGroupArn: targetGroup.arn,
    }],
},{ dependsOn: [targetGroup] });



    // Export the VPC, subnet IDs, and EC2 instance ID
    exports.vpcId = vpc.id;
    exports.publicSubnetIds = publicSubnets;
    exports.privateSubnetIds = privateSubnets;
    exports.rdsEndpoint = rdsInstance.endpoint;
    exports.route53Record=route53Record.id;
    
});