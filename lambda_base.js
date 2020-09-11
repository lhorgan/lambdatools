class LambdaClient {
  constructor(context, lambdaTimeout) {
    this.context = context;
    this.lambdaTimeout = lambdaTimeout;

    this.io = require('socket.io-client');

    this.relaySockets = {};

    this.maxQueueLength = 5;
    this.queue = [];
    this.jobTimeout = 5000;

    setTimeout(() => {
      this.cleanup();
    }, this.lambdaTimeout - 5000);

    this.mainLoop();
  }

  cleanup() {
    console.log("Cleaning up!");
  }

  async mainLoop() {
    console.log(this.context.getRemainingTimeMillis());
    while(this.context.getRemainingTimeMillis() > 2 * this.jobTimeout) {
      let task;
      if(task = this.queue.pop()) {
        console.log("HERE IS OUR JOB " + JSON.stringify(task));
        await this.executeJob(task);

        console.log("QUEUE LENGTH: " + this.queue.length);
        for(let i = this.queue.length; i < this.maxQueueLength; i++) {
          let relayToAskForWork = this.randomChoice(Object.keys(this.relaySockets));
          if(relayToAskForWork) {
            console.log("We are asking " + relayToAskForWork + " for work, the right way.");
            this.relaySockets[relayToAskForWork].send({type: "moreWork"});
          }
        }
      }
      else {
        console.log("NO JOBS!  ASKING FOR WORK!")
        let relayToAskForWork = this.randomChoice(Object.keys(this.relaySockets));
        console.log(Object.keys(this.relaySockets));
        console.log(relayToAskForWork);
        if(relayToAskForWork) {
          console.log("We are asking " + relayToAskForWork + " for work.");
          this.relaySockets[relayToAskForWork].send({type: "moreWork"});
        }
        await this.sleep(1000);
      }
    }
  }

  requestWork() {
    
  }

  async sleep(millis) {
    return new Promise((accept) => {
      setTimeout(() => {
        accept();
      }, millis);
    });
  }

  addRelaySocket(relayURL) {
    let socket = this.io(`${relayURL}/lambda`, {query: {name: this.context.functionName}});
    this.relaySockets[relayURL] = socket;
    /*socket.onopen(() => {
      socket.send({type: "ack"}); // acknowledge that a connection has been established, not really needed
    });*/
    socket.on("message", (message) => {
      console.log("message gotten!");
      console.log(JSON.stringify(message));
      if(message.type === "job") {
        this.queue.push({"message": message.job});
      }
      //this.receiveMessage(data, socket);
    });
    socket.on("disconnect", () => { // this will only happen if we take a relay offline
      console.log("socket disconnected");
      socket.disconnect();
      delete this.relaySockets[relayURL];
    });
  }

  async receiveMessage(data, socket) {
    if(data.type === "job") {
      /*let result = await this.executeJob(data.job);
      socket.send(result);

      console.log("QUEUE LENGHT IS NOW " + this.queue.length);*/

      this.queue.push(data.job);
    }
  }

  randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  async executeJob(job) {
    console.log(job);
  }
}

class MockClient extends LambdaClient {
  constructor(context, lambdaTimeout) {
    super(context, lambdaTimeout);
  }

  async executeJob(job) {
    await this.sleep(1000);
    console.log("Executed task " + JSON.stringify(job));
    
  }

  async cleanup() {
    console.log("cleaning up...");
  }
}

let mockContext = {
  getRemainingTimeMillis() {
    if(!this.startTime) {
      this.startTime = Date.now();
    }
    //console.log(this.startTime);
    return this.lambdaTimeout - (Date.now() - this.startTime);
  },
  lambdaTimeout: 300000,
  functionName: "mockFunction"
}

let mc = new MockClient(mockContext, 300000);
mc.addRelaySocket("http://localhost:8081");
mc.addRelaySocket("http://localhost:8082");