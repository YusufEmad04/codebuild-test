# called from rest api url (built from docker)
import os
import json
import boto3
import json

def lambda_handler(event, context):

    auth = event['headers']['Authorization']
    access_key = event['headers']['X-Access-Key']
    secret_key = event['headers']['X-Secret-Key']
    session_token = event['headers']['X-Session-Token']
    graphql_api_id = os.environ['GRAPHQL_API_ID']

    client = boto3.client('appsync')

    response = client.get_graphql_api(apiId=graphql_api_id)

    graphql_url = response['graphqlApi']['uris']['GRAPHQL']

    body = json.loads(event['body'])

    # call the docker function of the assesment using event mode and send auth in the event
    lambda_client = boto3.client('lambda')

    payload = {
        "auth": auth,
        "user_id" : body['user_id'],
        "identity_id" : body['identity_id'],
        "url": graphql_url,
        "access_key": access_key,
        "secret_key": secret_key,
        "session_token": session_token,
    }

    lambda_client.invoke(
        FunctionName=os.environ['AGENTS_PART_1'],
        # async call
        InvocationType='Event',
        Payload=json.dumps(payload),
    )

    return {
        'statusCode': 200,
        'body': json.dumps(event),
        'headers': {
            # all CORS headers
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': '*',
        }
    }