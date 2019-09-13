#!/usr/bin/env bash

# Read config file.
source ./deploy.config.sh

homeDirOnServer=$(ssh -i ${KeyPath} ${Server} pwd)"/"

appPathOnServer=${HomeDirOnServer}"server"

# Upload deployment scripts to the server.
scp -rp -i ${KeyPath} ./on.server.before.deploy.sh ${Server}:${homeDirOnServer}
scp -rp -i ${KeyPath} ./on.server.after.deploy.sh ${Server}:${homeDirOnServer}

# Run 'before' script on the server.
ssh -i ${KeyPath} ${Server} sh ${homeDirOnServer}on.server.before.deploy.sh

# Upload app files to the server.
echo "Uploading app files to the server:"
scp -i ${KeyPath} ./app.js ${Server}:${appPathOnServer}
scp -i ${KeyPath} ./config.json ${Server}:${appPathOnServer}
scp -i ${KeyPath} ./package.json ${Server}:${appPathOnServer}
scp -i ${KeyPath} ./showLog.sh ${Server}:${appPathOnServer}
scp -i ${KeyPath} ./showErrorsLog.sh ${Server}:${appPathOnServer}

# Run 'after' script on the server
ssh -i ${KeyPath} ${Server} sh ${homeDirOnServer}on.server.after.deploy.sh

