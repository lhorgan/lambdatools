class Relay {
  constructor(relayCount) {
    let express = require("express");
    let bodyParser = require("body-parser");

    this.app = express();
    this.AWS = require("aws-sdk");

    this.server = require('http').createServer(this.app);
    this.io =  require('socket.io')(this.server);
    this.coordinatorNamespace = this.io.of("/coordinator");
    this.lambdaNamespace = this.io.of("/lambda");

    this.lambdaSockets = {};

    this.app.use(bodyParser.json());
    this.listenHTTP();
    this.listenSocket();

    this.coordinatorSocket = null;

    this.maxDepth = 1; // max number of lambdas per function name
  }

  listenHTTP() {
    this.server.listen(8081, function () {
      console.log("App listening on port 8081");
    });

    this.app.post("/jobs", (req, res) => {
      console.log("jobs received");
      console.log(req.body);
      let jobsArray = req.body;
      this.sendsJobToLambda(jobsArray, (lambdaResp) => {
        res.send(JSON.stringify(lambdaResp));
      });
    });

    this.app.post("/lambdas", (req, res) => {
      let lambdaArray = req.body;
      this.invokeLambdas(lambdaArray);
    });
  }

  listenSocket() {
    this.coordinatorNamespace.on("connect", (socket) => {
      console.log("Coordinator connected");
      if(this.coordinatorSocket) {
        console.log("Appears the coordinator reconnected...");
        this.coordinatorSocket.disconnect();
      }
      this.coordinatorSocket = socket;
    });

    this.lambdaNamespace.on("connect", (socket) => {
      if(socket.handshake.query.name) {
        console.log("socket " + socket.id + " connected");
        let functionName = socket.handshake.query.name;

        this.addLambdaSocket(functionName, socket.id);

        socket.on("disconnect", () => {
          console.log("socket " + socket.id + " disconnected");
          this.removeLambdaSocket(functionName, socket.id);
        });
  
        socket.on("message", () => {
          console.log("received a message on socket " + socket.id);
        });
      }
      else {
        console.error("No function name established");
        socket.disconnect();
      }
    });
  }

  addLambdaSocket(functionName, socket) {
    if(!(functionName in this.lambdaSockets)) {
      this.lambdaSockets[functionName] = set();
    }
    if(this.lambdaSockets[functionName].length < this.maxDepth) {
      this.lambdaSockets[functionName].add(socket.id);
    }
  }

  removeLamdbaSocket(functionName, socket) {
    socket.removeAllListeners();
    this.lambdaSockets[functionName].delete(socket.id);
    socket.close();
    this.invokeLambda(this.lambdaInfos[functionName]);
  }

  invokeLambdas(lambdaNames) {
    for(let i = 0; i < lambdaNames.length; i++) {

    }
  }

  invokeLambda(lambdaInfo) {
    return new Promise((accept, reject) => {
      AWS.config.update({region: lambdaInfo.region});
      var lambda = new AWS.Lambda();

      let payload = {}
    });
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