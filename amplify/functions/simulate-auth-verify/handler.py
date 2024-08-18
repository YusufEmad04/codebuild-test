# streaming chatbots (from docker) called by lambda function url
import os
import json
import boto3
import urllib3.request

def lambda_handler(event, context):

    # # return hello
    # return {
    #     'statusCode': 200,
    #     'body': json.dumps("HELLO"),
    #     # 'headers': {
    #     #     # all CORS headers
    #     #     'Access-Control-Allow-Origin': '*',
    #     #     'Access-Control-Allow-Headers': '*',
    #     #     'Access-Control-Allow-Methods': '*',
    #     # }
    # }

    rest_api_url = os.environ['REST_API_URL']
    auth = event['headers']['Authorization']

    # path verify-auth

    http = urllib3.PoolManager()
    response = http.request('GET', rest_api_url + 'verify-auth', headers={'Authorization': auth})

    # response is "VERIFIED" if the auth is correct
    if response.data.decode('utf-8') == "VERIFIED":
        return {
            'statusCode': 200,
            'body': json.dumps("VERIFIED AND PASSED"),
            # 'headers': {
            #     # all CORS headers
            #     'Access-Control-Allow-Origin': '*',
            #     'Access-Control-Allow-Headers': '*',
            #     'Access-Control-Allow-Methods': '*',
            # }
        }
    else:
        return {
            'statusCode': 401,
            'body': json.dumps("UNAUTHORIZED"),
            # 'headers': {
            #     # all CORS headers
            #     'Access-Control-Allow-Origin': '*',
            #     'Access-Control-Allow-Headers': '*',
            #     'Access-Control-Allow-Methods': '*',
            # }
        }