class Relay {
  constructor() {
    let express = require("express");
    let bodyParser = require("body-parser");

    this.app = express();
    this.AWS = require("aws-sdk");

    this.server = require('http').createServer(this.app);
    this.io =  require('socket.io')(this.server);

    this.lambdaSockets = {};

    this.app.use(bodyParser.json());
    this.run();
    this.runSocket();

    ///this.uid = ID();

    this.maxDepth = 1; // max number of lambdas per function name
  }

  run() {
    this.server.listen(8081, function () {
      console.log("App listening on port 8081");
    });

    this.app.post("/urls", (req, res) => {
      console.log("jobs received");
      console.log(req.body);
    let jobsArray = req.body;
      this.sendsJobToLambda(jobsArray, (lambdaResp) => {
        res.send(JSON.stringify(lambdaResp));
      });
    });

    this.app.post("/lambdaNames", (req, res) => {
    });
  }

  runSocket() {
    this.io.on("connect", (socket) => {
      if(socket.handshake.query.name) {
        console.log("socket " + socket.id + " connected")
        this.addLambdaSocket(socket.id, socket.handshake.query.name);
      }
      else {
        console.error("No function name established");
      }
      
      socket.on("disconnect", () => {
        console.log("socket " + socket.id + " disconnected");
      });

      socket.on("message", () => {
        console.log("received a message on socket " + socket.id)
      });
    });
  }

  addLambdaSocket(socketID, functionName) {
    if(!(functionName in this.lambdaSockets)) {
      this.lambdaSockets[functionName] = [];
    }
    if(this.lambdaSockets[functionName].length < this.maxDepth) {
      this.lambdaSockets[functionName].push(socketID);
    }
  }
  
  sendJobsToLambda(jobsArray, cb) {
    let lambdaResps = [];

    for(let i = 0; i < jobsArray.length; i++) {
      let job = jobsArray[i];

      AWS.config.update({region: job.region});
      var lambda = new AWS.Lambda();
      
      let payload = job.job;

      var params = {
        FunctionName: job.name,
        Payload: JSON.stringify(payload)
      };

      lambda.invoke(params, (err, data) => {
        let lambdaResp = {};
        if(err) {

        }
        else {

        }
        lambdaResp.push(lambdaResp);
        
        if(lambdaResps.length === jobsArray.length) {
          cb(lambdaResps);
        }
      });
    }
  }
}

let e = new Relay();