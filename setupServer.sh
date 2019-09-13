#!/usr/bin/env bash

# Read configuration file.
source ./deploy.config.sh

# Upload setup script to the server.
scp -i ${KeyPath} ./serverSetupScript.sh ${Server}:${HomeDirOnServer}

# Show info from the server.
ssh -i ${KeyPath} ${Server} whoami
ssh -i ${KeyPath} ${Server} pwd

# Run setup script on the server.
ssh -i ${KeyPath} ${Server} sh ${HomeDirOnServer}serverSetupScript.sh

