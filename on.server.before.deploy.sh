#!/usr/bin/env bash

echo
echo "> on.server.before.deploy.sh started"

#echo "USER:" ${USER}
#echo "HOME:" ${HOME}

screen -S pm2monit -X quit
pm2 delete all

if [ -d ${HOME}/server/logs ]; then
    #  mkdir -p ${HOME}/log.backups/$(date "+%s") && mv ${HOME}/server/logs/* $_
    TIMESTAMP=$(date "+%s");
    mkdir -p ${HOME}/log.backups/${TIMESTAMP} && mv ${HOME}/server/logs/* ${HOME}/log.backups/${TIMESTAMP};
fi

rm -fr ${HOME}/server && mkdir -p ${HOME}/server/logs

# log
#echo "adding to log: ["$(date)"]" ${USER}": "${0}
#echo "["$(date)"] "${USER}": "${BASH_SOURCE} >> ${HOME}/deployment.log
echo "["$(date)"] "${USER}":" ${0} >> ${HOME}/deployment.log

echo "< on.server.before.deploy.sh finished"
echo
