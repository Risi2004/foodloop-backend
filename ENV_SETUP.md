# Environment Variables Setup Guide

## Quick Start

1. Copy the template below and create a `.env` file in the `backend` directory
2. Fill in your actual values
3. The server will validate all required variables on startup

## Required Environment Variables

Create a file named `.env` in the `backend` directory with the following variables:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Configuration
# Format: mongodb://[username:password@]host[:port][/database][?options]
# Example for local: mongodb://localhost:27017/foodloop
# Example for MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/foodloop
MONGODB_URI=mongodb://localhost:27017/foodloop

# AWS S3 Configuration
# Get these from AWS IAM Console -> Users -> Your User -> Security Credentials
AWS_ACCESS_KEY_ID=your_aws_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key_here
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your_bucket_name_here

# JWT Secret (for future authentication)
# Generate a random string: openssl rand -base64 32
JWT_SECRET=your_jwt_secret_key_here

# File Upload Configuration (optional)
# Maximum file size in bytes (default: 10MB = 10485760)
MAX_FILE_SIZE=10485760
```

## How to Get AWS Credentials

1. **AWS Access Key ID & Secret Access Key:**
   - Log in to AWS Console
   - Go to IAM (Identity and Access Management)
   - Click on "Users" → Select your user (or create a new one)
   - Go to "Security credentials" tab
   - Click "Create access key"
   - Choose "Application running outside AWS"
   - Copy the Access Key ID and Secret Access Key
   - **Important:** Save the Secret Access Key immediately - you won't be able to see it again!

2. **AWS Region:**
   - Choose the region where your S3 bucket is located
   - Common regions: `us-east-1`, `us-west-2`, `eu-west-1`, etc.

3. **S3 Bucket Name:**
   - Go to S3 in AWS Console
   - Create a new bucket or use an existing one
   - Copy the bucket name
   - Make sure the bucket has proper permissions for your IAM user

## How to Get MongoDB URI

### Local MongoDB:
```
MONGODB_URI=mongodb://localhost:27017/foodloop
```

### MongoDB Atlas (Cloud):
1. Create a cluster at https://www.mongodb.com/cloud/atlas
2. Click "Connect" → "Connect your application"
3. Copy the connection string
4. Replace `<password>` with your database password
5. Replace `<dbname>` with your database name (e.g., `foodloop`)

Example:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/foodloop
```

## Generate JWT Secret

Run this command in your terminal:
```bash
openssl rand -base64 32
```

Or use any random string generator.

## Validation

The server will automatically validate all required environment variables on startup. If any are missing, you'll see an error message listing which variables need to be set.

## Security Notes

- **Never commit your `.env` file to version control**
- The `.env` file is already in `.gitignore`
- Use different credentials for development and production
- Rotate your AWS keys regularly
- Keep your JWT secret secure and random
