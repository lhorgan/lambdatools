#!/bin/bash
sudo apt update -y;
sudo apt install git -y;
cd /home/admin;
sudo git clone https://github.com/lhorgan/lambdatools.git /home/admin/lambdatools;
curl -sL https://deb.nodesource.com/setup_12.x | sudo bash -;
sudo apt install nodejs -y;
cd lambdatools;
npm install;
cd ..;
sudo npm install pm2@latest -g;
su admin -c 'pm2 start /home/admin/lambdatools/ManualRelay.js;';
su admin -c 'pm2 start /home/admin/lambdatools/updateRelay.js;';
su admin -c 'pm2 save;';
su admin -c 'sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u admin --hp /home/admin;';