#!/bin/bash

# cd lambdatools;
# git pull;
# pm2 list;
# pm2 restart ManualRelay;

# # sudo chgrp -R admin lambdatools;
# # sudo chown -R admin lambdatools;

# # cd lambdatools;
# # grep maxDepth relay.js;

# pm2 restart ManualRelay;
#pm2 flush ManualRelay;

pm2 stop ManualRelay;
#pm2 restart ManualRelay;
