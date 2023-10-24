const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");


const config = new pulumi.Config();
const vpcCidrBlock = config.getSecret('cidrBlock');

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


    // Create an EC2 security group
    const ec2SecurityGroup = new aws.ec2.SecurityGroup("ec2SecurityGroup", {
        vpcId: vpc.id,
        ingress: [
            {
                protocol: "tcp",
                fromPort: 22,
                toPort: 22,
                cidrBlocks: ["0.0.0.0/0"],
            },
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
            {
                protocol: "tcp",
                fromPort: 3000,
                toPort: 3000,
                cidrBlocks: ["0.0.0.0/0"],
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

    const dbSecurityGroup = new aws.ec2.SecurityGroup("dbSecurityGroup", {
        vpcId: vpc.id,
    });

    const applicationSecurityGroup = new aws.ec2.SecurityGroup("applicationSecurityGroup", {
        vpcId: vpc.id,
    });

    new aws.ec2.SecurityGroupRule("dbIngressRule", {
        securityGroupId: dbSecurityGroup.id,
        type: "ingress",
        fromPort: 0, // MySQL/MariaDB port
        toPort: 3306,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
    });

    new aws.ec2.SecurityGroupRule("dbEgressRule", {
        securityGroupId: dbSecurityGroup.id,
        type: "egress",
        fromPort: 0,
        toPort: 65535,
        protocol: "tcp",
        cidrBlocks: ["0.0.0.0/0"],
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
        vpcSecurityGroupIds: [dbSecurityGroup.id], // Attach the database security group
    });


    // Create an EC2 instance
    const ec2Instance = new aws.ec2.Instance("ec2Instance", {
        ami: "ami-060f9fbf8b4c721cc", // Replace with your desired AMI ID
        instanceType: "t2.micro",
        subnetId: publicSubnets[0], // Launch in the first public subnet
        vpcSecurityGroupIds: [ec2SecurityGroup.id],
        keyName: config.get('awskey'), // Replace with your key pair name
        rootBlockDevice: {
            volumeSize: 25, // Set the root volume size to 25 GB
            volumeType: "gp2", // Set the root volume type to General Purpose SSD (GP2)
            deleteOnTermination: true,

        },
        tags: {
            Name: "MyEC2Instance",
        },
        dependsOn:[rdsInstance],
        userDataReplaceOnChange:true,
        userData:pulumi.interpolate`#!/bin/bash
sudo mkdir /home/admin/asdb
sudo chmod a+w /home/admin/WebApp
cd /home/admin/WebApp
sudo rm -rf /home/admin/WebApp/.env
sudo echo "DB_HOST=${rdsInstance.address}" >> /home/admin/WebApp/.env
sudo echo "DB_USER=root" >> /home/admin/WebApp/.env
sudo echo "DB_PASSWORD=pranavkulkarni" >> /home/admin/WebApp/.env
sudo echo "DB_NAME=Assignment3" >> /home/admin/WebApp/.env
sudo echo "PORT=3000" >> /home/admin/WebApp/.env
sudo echo "CSVPATH="/home/admin/WebApp/opt/users.csv" " >> /home/admin/WebApp/.env
sudo cat /home/admin/WebApp/.env
`,
    });
    // Export the VPC, subnet IDs, and EC2 instance ID
    exports.vpcId = vpc.id;
    exports.publicSubnetIds = publicSubnets;
    exports.privateSubnetIds = privateSubnets;
    exports.ec2InstanceId = ec2Instance.id;
    exports.rdsEndpoint = rdsInstance.endpoint;
    
});