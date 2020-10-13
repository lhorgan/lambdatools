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