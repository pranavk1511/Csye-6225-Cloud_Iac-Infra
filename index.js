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
        ],
    });

    // Create an EC2 instance
    const ec2Instance = new aws.ec2.Instance("ec2Instance", {
        ami: "ami-02f4e2c25ae7d0c23", // Replace with your desired AMI ID
        instanceType: "t2.micro",
        subnetId: publicSubnets[0], // Launch in the first public subnet
        vpcSecurityGroupIds: [ec2SecurityGroup.id],
        keyName: "awskey", // Replace with your key pair name
        tags: {
            Name: "MyEC2Instance",
        },
    });

    // Export the VPC, subnet IDs, and EC2 instance ID
    exports.vpcId = vpc.id;
    exports.publicSubnetIds = publicSubnets;
    exports.privateSubnetIds = privateSubnets;
    exports.ec2InstanceId = ec2Instance.id;
});
