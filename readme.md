# Infrastructure as Code with Pulumi

This guide provides an overview of how to create network infrastructure using Pulumi. We'll create a Virtual Private Cloud (VPC) with associated public and private subnets, configure route tables, and attach an Internet Gateway for public internet access.

## Prerequisites

Before getting started, make sure you have the following:

1. [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/) installed.
2. [AWS CLI](https://aws.amazon.com/cli/) installed and configured with necessary credentials.

## Infrastructure Setup

### 1. Create a Pulumi Project

```bash
pulumi new aws-javascript
```


### 2. Define your Configuration
Edit your Pulumi.dev.yaml file to configure your VPC and subnet settings.

### 3. Create Infrastructure with Pulumi
In your Pulumi JavaScript file (e.g., index.js), use Pulumi to define and deploy your infrastructure. 

## AWS Resources

### Virtual Private Cloud (VPC)

- Created a new VPC named "myVPC" with specified CIDR block.

### Internet Gateway

- Created a new Internet Gateway named "myInternetGateway" and attached it to the VPC.

### Availability Zones

- Queried and obtained the first three availability zones.

### Subnets

- Created public and private subnets in each availability zone.
- Associated route tables with subnets.

### Route Tables

- Created public and private route tables.
- Associated subnets with route tables.

### Security Groups

- Created security groups for load balancer, EC2 instances, and RDS instance.

### RDS (Relational Database Service)

- Created a MySQL RDS instance with specified configurations.

### IAM (Identity and Access Management)

- Created an IAM role with policies for EC2 instances.
- Attached policies for CloudWatch and S3 to the role.

### Load Balancer

- Created an Application Load Balancer with specified configurations.
- Configured listeners and target groups.

### Auto Scaling

- Created an Auto Scaling Group with scaling policies and CloudWatch alarms.

## AWS Lambda

- Created an IAM role and attached policies for Lambda function.
- Defined and created an AWS Lambda function with dependencies on S3 bucket.

### SNS (Simple Notification Service)

- Created an SNS topic and subscription for Lambda function.

## AWS CloudWatch Alarms

- Created CloudWatch alarms for scaling based on CPU utilization.

## Route53

- Created a Route53 record for the load balancer.

## AWS DynamoDB

- Created a DynamoDB table with specified attributes and global secondary indexes.
- Configured an IAM policy for DynamoDB access and attached it to the Lambda execution role.

## AWS S3

- Created an S3 bucket named "pranav-bucket-1" with private ACL.

## Google Cloud Platform (GCP) Resources

### Cloud Storage (GCS)

- Created a GCS bucket named "csye6225_demo_gcs_bucket" with versioning enabled.

### GCP IAM

- Created a service account with necessary permissions and attached it to the GCS bucket.

### GCP IAM Policy

- Attached a custom IAM policy to the Lambda execution role for GCS access.

## Outputs

- Exported various resource IDs and information for reference and integration with other services.

