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
    while(this.context.getRemainingTimeMillis() > 2 * this.jobTimeout) {
      let task;
      if(task = this.queue.pop()) {
        await this.executeJob(task);
      }
      else {
        await this.sleep(20);
      }
    }
  }

  async sleep(millis) {
    return new Promise((accept) => {
      setTimeout(() => {
        accept();
      }, millis);
    });
  }

  addRelaySocket(relayURL) {
    let socket = this.io(relayURL, {query: {name: this.context.functionName}});
    this.relaySockets[relayURL] = socket;
    socket.onopen(() => {
      socket.send({type: "ack"}); // acknowledge that a connection has been established, not really needed
    });
    socket.on("message", (data) => {
      this.queue.push({"data": data, "socket": socket});
      //this.receiveMessage(data, socket);
    });
    socket.on("disconnect", () => {
      socket.close();
      delete this.sockets[socketURL];
    });
  }

  async receiveMessage(data, socket) {
    if(data.type === "job") {
      let result = await this.executeJob(data.job);
      socket.send(result);

      for(let i = this.queue.length; i < this.maxQueueLength; i++) {
        let relayToAskForWork = this.randomChoice(Object.keys(this.relaySockets));
        this.relaySockets[relayToAskForWork].send({type: "moreWork"});
      }
    }
  }

  randomChoice(arr) {
    return arr[Math.random() * arr.length];
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
    console.log("Executed task " + JSON.stringify(task.job));
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
    return this.lambdaTimeout - (Date.now() - this.startTime);
  },
  functionName: "mockFunction"
}

let mc = new MockClient(mockContext, 30000);
mc.addRelaySocket("http://localhost:8081");