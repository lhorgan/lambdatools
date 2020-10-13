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
    this.relayURLs = [];

    this.app.use(bodyParser.json());
    this.listenHTTP();
    this.listenSocket();

    this.pendingWorkRequest = false;

    this.coordinatorSocket = null;

    this.queue = [];

    this.lambdaInfos = {};

    this.maxDepth = 5; // max number of lambdas per function name

    this.completedJobs = [];
    this.scale();
  }

  async scale() {
    while(true) {
      for(let key in this.lambdaInfos) {
        //console.log()
        let functionName = this.lambdaInfos[key].name;
        console.log(functionName);
        if(functionName in this.lambdaSockets && this.lambdaSockets[functionName].size < this.maxDepth) {
          //console.log("scaling from.... " + this.lambdaSockets[functionName].size);
          this.invokeLambda(this.lambdaInfos[key]);
        }
      }
      await this.sleep(1000);
    }
  }

  async sleep(millis) {
    return new Promise((accept, reject) => {
      setTimeout(() => {
        accept();
      }, millis);
    });
  }

  listenHTTP() {
    // Listen on the port specified in console args
    this.server.listen(this.relayPort, ()  => {
      //console.log("App listening on port " + this.relayPort);
    });

    /**
     * JOBS endpoint
     * expects a list of jobs in the request body
     * sends 200
     */
    this.app.post("/jobs", (req, res) => {
      //console.log("jobs received");
      //console.log(req.body);
      let jobs = req.body.jobs;
      this.relayURLs = req.body.relayURLs;
      //console.log("RELAY URLS:");
      //console.log(this.relayURLs);

      for(let i = 0; i < jobs.length; i++) { // add all the jobs to the queue
        this.queue.push(jobs[i]);
      }
      //console.log("QUEUE LENGTH NOW " + this.queue.length);

      res.send({"status": 200});
    });
    
    /**
     * LAMBDAS endpoint
     * expects a list of {name: "LambdaName", region: "LambdaRegion"}
     */
    this.app.post("/lambdas", (req, res) => {
      //console.log("Lambdas recieved!");
      //console.log(req.body);
      let lambdaArray = req.body;
      //this.invokeLambdas(lambdaArray);

      for(let i = 0; i < lambdaArray.length; i++) {
        this.lambdaInfos[lambdaArray[i].name] = lambdaArray[i];
      }

      res.send({"status": 200});
    });

    this.app.post("/relayURLs", (req, res) => {
      let lambdaArray = req.body;
      let relayURLs = req.body;

      for(let i = 0; i < lambdaArray.length; i++) {
        this.lambdaInfos[lambdaArray[i].name] = lambdaArray[i];
      }

      res.send({"status": 200});
    });
  }

  listenSocket() {
    this.coordinatorNamespace.on("connect", (socket) => {
      //console.log("Coordinator connected");
      if(this.coordinatorSocket) {
        //console.log("Appears the coordinator reconnected...");
        this.coordinatorSocket.disconnect();
      }
      this.coordinatorSocket = socket;

      setInterval(() => { // periodically send completed jobs
        if(this.completedJobs.length > 0) {
          this.coordinatorSocket.send({type: "jobsComplete", jobsArray: this.completedJobs});
          this.completedJobs = [];
        }
      }, 1000);
    });

    this.lambdaNamespace.on("connect", (socket) => {
      if(socket.handshake.query.name) {
        console.log("socket " + socket.id + " connected with ip " + socket.handshake.address);
        let functionName = socket.handshake.query.name;

        this.addLambdaSocket(functionName, socket);

        socket.on("disconnect", () => {
          console.log("socket " + socket.id + " disconnected");
          this.removeLambdaSocket(functionName, socket);
        });
  
        socket.on("message", (message) => {
          //console.log("received a message on socket " + socket.id);
          //console.log(message);
          if(message.type === "moreWork") {
            //console.log(`We need to send more work to ${socket.id} of ${functionName} fame.`);
            let job = this.queue.pop();
            //console.log("POPPED JOB " + JSON.stringify(job));
            if(job) {
              console.log("sending a job to " + socket.id);
              console.log(job);
              socket.send({type: "job", job}); 
            }
            if(this.queue.length < 25 && !this.pendingWorkRequest) {
              if(!this.coordinatorSocket) {
                //console.log("coordinator not yet connected....");
                return;
              }
              this.coordinatorSocket.send({type: "moreWork"});
              this.pendingWorkRequest = true;
              setTimeout(() => {
                this.pendingWorkRequest = false;
              }, 2000);
            }
          }
          else if(message.type === "jobComplete") {
            //console.log("JOB COMPLETED!");
            //console.log(JSON.stringify(message));
            this.completedJobs.push(message);
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
    //console.log("Adding socket " + functionName);
    if(!(functionName in this.lambdaSockets)) {
      this.lambdaSockets[functionName] = new Set();
    }
    //console.log("LENGHT: " + this.lambdaSockets[functionName].size);
    if(this.lambdaSockets[functionName].size < this.maxDepth) {
      //console.log("We have added a socket!");
      this.lambdaSockets[functionName].add(socket.id);
    }
    else {
      // we want this function to end itself
    }
  }

  removeLambdaSocket(functionName, socket) {
    socket.removeAllListeners();
    this.lambdaSockets[functionName].delete(socket.id);
    this.invokeLambda(this.lambdaInfos[functionName]);
  }

  invokeLambdas(lambdaInfos) {
    //console.log("Invoking lambdas...");
    //console.log(lambdaInfos);
    for(let i = 0; i < lambdaInfos.length; i++) {
      //console.log("INVOKING LAMBDA " + i);
      this.invokeLambda(lambdaInfos[i]);
    }
  }

  invokeLambda(lambdaInfo) {
    //console.log("cripes");
    return;
  }
}

exports.Relay = Relay;

// //console.log(process.argv[2]);
// let e = new Relay(process.argv[2]);