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

### 4. Deploy the Infrastructure
Run the following command to deploy your infrastructure: