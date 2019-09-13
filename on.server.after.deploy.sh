#!/usr/bin/env bash

echo
echo "> on.server.after.deploy.sh started"

cd ${HOME}/server

echo
echo "========== 'npm install' start ========="
npm install
echo "========== 'npm install' end   ========="
echo

# See basic pm2 commands on:
# http://pm2.keymetrics.io/docs/usage/quick-start/
pm2 delete all
screen -dmS pm2monit pm2 monit
pm2 start app.js --name App

# log
cd
echo "["$(date)"] "${USER}": "${BASH_SOURCE} >> ${HOME}/deployment.log

echo "< on.server.after.deploy.sh finished"