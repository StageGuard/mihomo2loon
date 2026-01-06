#!/bin/sh

sudo docker stop mihomo2loon
sudo docker build -t mihomo2loon .
sudo docker run -d --restart=always --name mihomo2loon -p 25500:8080 mihomo2loon