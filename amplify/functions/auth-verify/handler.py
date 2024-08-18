import os
import json
import boto3
import urllib3.request

def lambda_handler(event, context):
    # return in the body "VERIFIED"

    return {
        'statusCode': 200,
        'body': json.dumps("VERIFIED"),
        'headers': {
            # all CORS headers
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': '*',
        }
    }
        