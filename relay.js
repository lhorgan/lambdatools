class Relay {
  constructor(relayPort) {
    this.relayPort = relayPort;
    
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

    this.pendingWorkRequest = false;

    this.coordinatorSocket = null;

    this.queue = [];

    this.lambdaInfos = {};

    this.maxDepth = 1; // max number of lambdas per function name
  }

  listenHTTP() {
    this.server.listen(this.relayPort, ()  => {
      console.log("App listening on port " + this.relayPort);
    });

    this.app.post("/jobs", (req, res) => {
      console.log("jobs received");
      console.log(req.body);
      let jobs = req.body;

      for(let i = 0; i < jobs.length; i++) { // add all the jobs to the queue
        this.queue.push(jobs[i]);
      }
      console.log("QUEUE LENGHT NOW " + this.queue.length);

      res.send({"status": 200});
    });

    this.app.post("/lambdas", (req, res) => {
      let lambdaArray = req.body;
      this.invokeLambdas(lambdaArray);

      for(let i = 0; i < lambdaArray.length; i++) {
        this.lambdaInfos[lambdaArray[i]].name = lambdaArray[i];
      }
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

        this.addLambdaSocket(functionName, socket);

        socket.on("disconnect", () => {
          console.log("socket " + socket.id + " disconnected");
          this.removeLambdaSocket(functionName, socket);
        });
  
        socket.on("message", (message) => {
          console.log("received a message on socket " + socket.id);
          console.log(message);
          if(message.type === "moreWork") {
            console.log(`We need to send more work to ${socket.id} of ${functionName} fame.`);
            let job = this.queue.pop();
            console.log("POPPED JOB " + JSON.stringify(job));
            if(job) {
              console.log("sending a job to " + socket.id);
              socket.send({type: "job", job}); 
            }
            if(this.queue.length < 25 && !this.pendingWorkRequest) {
              this.coordinatorSocket.send({type: "moreWork"});
              this.pendingWorkRequest = true;
              setTimeout(() => {
                this.pendingWorkRequest = false;
              }, 2000);
            }
          }
          else if(message.type === "jobComplete") {
            console.log(message);
            this.coordinatorSocket.send(message);
          }
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
      this.lambdaSockets[functionName] = new Set();
    }
    if(this.lambdaSockets[functionName].length < this.maxDepth) {
      this.lambdaSockets[functionName].add(socket.id);
    }
  }

  removeLambdaSocket(functionName, socket) {
    socket.removeAllListeners();
    this.lambdaSockets[functionName].delete(socket.id);
    this.invokeLambda(this.lambdaInfos[functionName]);
  }

  invokeLambdas(lambdaInfos) {
    for(let i = 0; i < lambdaInfos.length; i++) {
      this.invokeLambda(lambdaInfos[i]);
    }
  }

  invokeLambda(lambdaInfo) {
    return;
  }
}

console.log(process.argv[2]);
let e = new Relay(process.argv[2]);