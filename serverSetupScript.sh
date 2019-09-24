#!/usr/bin/env bash

# Update the system.
sudo apt update && sudo apt dist-upgrade -y && sudo apt autoremove -y && sudo apt autoclean -y && sudo apt install -fy

# Install required software.
sudo apt install -y curl ccze vim tree screen htop git

# Download minimal .vimrc
wget https://gist.githubusercontent.com/ageyev/3ac5b2935b0329540ecc1b95924686dc/raw/cc8348c7f379524a6b174d45d8469cdf4d41299e/.vimrc -O ${HOME}/.vimrc

# Install Node.js
# See: https://github.com/nodesource/distributions/blob/master/README.md#installation-instructions
curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential

sudo chown -R $USER:$(id -gn $USER) ${HOME}/.config
sudo npm install -g npm@latest

# https://github.com/Unitech/pm2
sudo npm install pm2 -g

#[PM2] Remove init script via:
#$ pm2 unstartup systemd

#Make pm2 auto-boot at server restart:
pm2 startup

if [ ! -d log.backups ]; then
  mkdir log.backups
fi

if [ ! -d server/logs ]; then
  mkdir -p server/logs
fi

# log
#echo "adding to log: ["$(date)"]" ${USER}":" ${0}
#echo "["$(date)"] "${USER}": "${BASH_SOURCE} >> ${HOME}/deployment.log
echo "["$(date)"] "${USER}":" ${0} >> ${HOME}/deployment.log
