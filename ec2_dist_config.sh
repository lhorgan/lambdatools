#!/bin/bash
log="/var/log/lukelog.txt"
sudo touch $log
sudo apt update | sudo tee -a $log
curl -sL https://deb.nodesource.com/setup_12.x | sudo bash -
sudo apt install nodejs
# curl -sL https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh -o install_nvm.sh
# bash install_nvm.sh
# source ~/.profile
# nvm install node
# wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
# export NVM_DIR="$HOME/.nvm"
# [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
# [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
# nvm install node | sudo tee -a $log
# npm install pm2@latest -g | sudo tee -a $log
# git clone https://github.com/lhorgan/distributor.git distributor | sudo tee -a $log
# pm2 start distributor/distributor.js | sudo tee -a $log