const redis = require("redis");
const lineByLine = require('n-readlines');
const fetch = require('node-fetch');
const passport = require('passport');
const { raw } = require("body-parser");

const h = require('./util.js')._Util; // h for helpers


class Distributor {
  constructor(config) {
    this.retryCount = config.retryCount;
    this.onSuccess = config.onSuccess;
    this.onFail = config.onFail;
    this.jobToRow = config.jobToRow;
    this.relayNames = config.relayNames;
    this.lambdaNames = config.lambdaNames;
    this.jobsPerSecond = config.jobsPerSecond;
    this.namespace = config.namespace;
    this.client = redis.createClient();
    this.jobsPerRelay = 50; // jobs per relay per request

    this.relayAddresses = ["http://127.0.0.1:8081"];
    this.relaySockets = {};

    this.io = require('socket.io-client');
    console.log("setting up this.io");

    this.client.on("error", function (err) {
      console.error("Error " + err);
    });
  }

  addRelaySocket(relayURL) {
    console.log("opening a connection...");
    //console.log(this.io);
    let socket = this.io(`${relayURL}/coordinator`);
    this.relaySockets[relayURL] = socket;
    /*socket.onopen(() => {
      console.log("sending an ack");
      socket.send({type: "ack"}); // acknowledge that a connection has been established, not really needed
    });
    socket.on("message", (data) => {
      console.log("message received");
      if(message.type === "moreJobs") {
        console.log("sending more jobs...");
      }
    });
    socket.on("disconnect", () => { // this will only happen if we take a relay offline
      console.log("we disconnected... woops");
      socket.disconnect(true);
      delete this.relaySockets[relayURL];
    });*/
  }

  async sleep(millis) {
    return new Promise((accept, reject) => {
      setTimeout(() => {
        accept();
      }, millis);
    });
  }

  async mainLoop() {
    // 10 relays, 500 jobs per second, 50 jobs per relay per second
    let relayIndex = 0;
    let jobsArray = [];

    setInterval(async () => {
      // send any jobs that are available, up to 50 per relay
      for(let i = 0; i < this.jobsPerRelay; i++) {
        let nextJob = await this.getNextJob();//await h.handle(h.redisLPop(this.client, this.namespace, "jobs"));
        if(nextJob === null) {
          break;
        }
        
        if(typeof(this.onNextJob) === "function") {
          this.onNextJob(nextJob);
        }

        jobsArray.push({"job": nextJob.job, 
                        "metadata": nextJob.metadata, 
                        "id": this.randomString(), 
                        "lambdaName": this.randomChoice(this.lambdaNames)});
      }
      this.distributeJobs(jobsArray, relayIndex);
      relayIndex = (relayIndex + 1) % this.relayAddresses.length;
    }, 1000 / this.relayAddresses.length);
  }

  distributeJobs(jobsArray, relayIndex) {
    console.log("FETCHING " + this.relayAddresses[relayIndex]);
    fetch(this.relayAddresses[relayIndex] + "/jobs", {
          method: "post",
          body: jobsArray,
          headers: { 'Content-Type': 'application/json' }
        })
        .then(this.handleErrors)
        .then(response => response.json())
        .then(data => {
            let processedURLs = this.processCompletedJobs(data);
        })
        .catch(err => {
            console.log(err);
            console.log("Something seems to have gone wrong...");
        });
  }

  handleErrors(response) {
    if(!response.ok) {
      throw Error(response.statusText);
    }
    return response;
  }

  processCompletedJobs(data) {
    console.log("todo... not yet implemented");
  }

  async getNextJob() {
    let [job, err] = await h.handle(h.redisLPop(this.client, this.namespace, "jobs"));
    console.log(job);
    
    if(err) {
      console.error(err);
      return null;
    }

    if(job) {
      h.redisSet(this.client, this.namespace, job);
    }
    return job;
  }

  async getJobsCount() {
    let [count, err] = await h.handle(h.redisLen(this.client, this.namespace, "jobs"));
    if(err) {
      console.error(err);
      return null;
    }
    return count;
  }

  randomString() {
    return Math.random().toString().substr(2);
  }

  randomChoice(arr) {
    return arr[Math.random() * arr.length];
  }

  // job is the job itself, what you want sent to be processed
  // metadata is any information you want to be associated with the job
  addJob(job, metadata) {
    h.redisLPush(this.client, this.namespace, "jobs", {"job": job, "metadata": metadata});
  }

  start() {
    this.mainLoop();
  }

  stop() {
    console.log("Not yet... sorry");
  }
}

class TSVDistributor extends Distributor {
  constructor(config) {
    super(config);
    //this.configure(config);
  }

  async configure(config) {
    console.log("configuring");
    this.readstream = new lineByLine(config.inputFile);
    this.separator = config.separator || "\t";
    this.metadataFields = new Set([]);

    this.fields = this.readstream.next().toString().trim().split(this.separator);
    console.log("here is what h really is");
    console.log(h.redisLPop);
    let [readToLine, err] = await h.handle(h.redisLPop(this.client, this.namespace, `admin_${this.namespace}_readToLine`));

    if(err) {
      readToLine = 0;
    }

    try {
      readToLine = parseInt(readToLine)
    }
    catch {
      readToLine = 0;
    }

    this.seek(readToLine); // seeks to the appropriate line
    this.linesRead = 0;
  }

  seek(readToLine) {
    let linesRead = 0;
    while((linesRead < readToLine) && (line = readstream.next())) {
      linesRead++;
    }
    this.linesRead = linesRead;
  }

  addJobsLoop() {
    let jobsInterval = setInterval(() => {
      let jobsPendingCount = 0; // something
      let jobsToAdd = 5 * this.jobsPerSecond;
      let jobsAdded = 0;
      let line = null;
      if(jobsPendingCount < jobsToAdd) {
        while((line = this.readstream.next()) && (jobsAdded < jobsToAdd)) {
          let rawData = line.toString().trim().split(this.separator);
          console.log(rawData);
          let job = {};
          let metadata = {};
          for(let i = 0; i < this.fields.length; i++) {
            if(this.metadataFields.has(this.fields[i])) {
              metadata[this.fields[i]] = rawData[i];
            }
            else {
              job[this.fields[i]] = rawData[i];
            }
          }
          this.addJob(job, metadata);
        }
        if(!line) {
          this.readAllLines = true;
          clearInterval(jobsInterval);
        }
      }
    });
  }

  onNextJob(job) {
    if(this.readAllLines && job === null) {
      console.log("no jobs left!");
    }
  }
}

function testDistributor() {
  let d = new TSVDistributor({
    retryCount: 0,
    relayIps: ["http://localhost:8081"],
    lambdaNames: ["hi"],
    jobsPerSecond: 3,
    namespace: "abctest",
    inputFile: "dummydata.csv",
    separator: ",",
    metadataFields: []
  });
  //d.start();
  //d.addJobsLoop();
  d.addRelaySocket("http://localhost:8081")
}

testDistributor();