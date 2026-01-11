#!/bin/bash

BASE_URL=""
AUTH_KEY=""
APPEND_AUTH_KEY="true"

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --base-url) BASE_URL="$2"; shift ;;
        --auth-key) AUTH_KEY="$2"; shift ;;
        --dont-append-auth-key) APPEND_AUTH_KEY="false"; shift ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

# Build Docker args
DOCKER_ENV_ARGS=""
if [ -n "$BASE_URL" ]; then
    DOCKER_ENV_ARGS="$DOCKER_ENV_ARGS -e SERVICE_BASE_URL=$BASE_URL"
fi
if [ -n "$AUTH_KEY" ]; then
    DOCKER_ENV_ARGS="$DOCKER_ENV_ARGS -e SERVICE_AUTH_KEY=$AUTH_KEY"
fi
if [ -n "$APPEND_AUTH_KEY" ]; then
    DOCKER_ENV_ARGS="$DOCKER_ENV_ARGS -e APPEND_AUTH_KEY=$APPEND_AUTH_KEY"
fi

echo "Deploying Mihomo2Loon..."

sudo docker stop mihomo2loon 2>/dev/null
sudo docker build -t mihomo2loon .
sudo docker rm mihomo2loon 2>/dev/null
sudo docker run -d --restart=always --name mihomo2loon -p 25500:8080 $DOCKER_ENV_ARGS mihomo2loon
sudo docker logs -f mihomo2loon