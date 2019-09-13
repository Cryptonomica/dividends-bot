#!/usr/bin/env bash

# Please run:
#
#  $ gcloud auth login
#
# to obtain new credentials, or if you have already logged in with a different account:
#
#  $ gcloud config set account ACCOUNT
#
# to select an already authenticated account to use.

## to change project ID:
#  $ gcloud config set project PROJECT_ID

source ./deploy.config.sh

gcloud beta compute --project ${project} ssh --zone ${zone} ${serverName}

