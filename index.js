const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");

// Define the AWS region and availability zones
const region = "us-east-1";
const availabilityZones = ["us-east-1a", "us-east-1b", "us-east-1c"];

// Create a new VPC
const vpc = new aws.ec2.Vpc("myVPC", {
    cidrBlock: "10.0.0.0/16",
    enableDnsHostnames: true,
    enableDnsSupport: true,
});

// Create an Internet Gateway
const internetGateway = new aws.ec2.InternetGateway("myInternetGateway", {
    vpcId: vpc.id,
});

// Create public and private subnets in different availability zones
const publicSubnets = [];
const privateSubnets = [];

for (let i = 0; i < availabilityZones.length; i++) {
    const az = availabilityZones[i];

    const publicSubnet = new aws.ec2.Subnet(`publicSubnet-${az}`, {
        vpcId: vpc.id,
        cidrBlock: `10.0.${i}.0/24`,
        availabilityZone: az,
        mapPublicIpOnLaunch: true,
        tags: { Name: `publicSubnet-${az}` },
    });

    const privateSubnet = new aws.ec2.Subnet(`privateSubnet-${az}`, {
        vpcId: vpc.id,
        cidrBlock: `10.0.${i + 3}.0/24`,
        availabilityZone: az,
        tags: { Name: `privateSubnet-${az}` },
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

    const routeTableAssociation = new aws.ec2.RouteTableAssociation(`publicRouteTableAssociation-${az}`, {
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

    const routeTableAssociation = new aws.ec2.RouteTableAssociation(`privateRouteTableAssociation-${az}`, {
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

// Export the VPC and subnet IDs
exports.vpcId = vpc.id;
exports.publicSubnetIds = publicSubnets;
exports.privateSubnetIds = privateSubnets;
