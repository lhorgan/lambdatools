const asyncRedis = require("async-redis");

class Distributor {
  constructor(config) {
    this.retryCount = config.retryCount;
    this.onSuccess = config.onSuccess;
    this.onFail = config.onFail;
    this.jobToRow = config.jobToRow;
    this.relayNames = config.relayNames;
    this.lambdaNames = config.lambdaNames;
    this.jobsPerSecond = config.jobsPerSecond;
    this.client = asyncRedis.createClient(config.namespace);
    this.jobsPerRelay = 50; // jobs per relay per request

    this.relayAddreses = [];
  }

  async mainLoop() {
    // 10 relays, 500 jobs per second, 50 jobs per relay per second
    let relayIndex = 0;
    let jobsArray = [];

    setInterval(async () => {
      // send any jobs that are available, up to 50 per relay
      for(let i = 0; i < this.jobsPerRelay; i++) {
        let nextJob = await this.client.lpop("jobs");
        if(nextJob === null) {
          break;
        }
        jobsArray.push({"job": nextJob, "id": this.randomString(), "lambdaName": this.randomChoice(this.lambdaNames)});
      }
      this.distributeJobs(relayIndex, jobsArray);
    }, 1000 / this.relayURLs.length);
  }

  distributeJobs(jobsArray) {
    fetch(this.relayAddreses[relayIndex] + "/jobs", {
            method: "post",
            body: urls,
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

  processCompletedJobs(data) {
    console.log("todo... not yet implemented");
  }

  async getNextJob() {
    let job = await this.client.lpop("jobs");
    
    if(job) {
      this.client.set(job.id, job); // back up the job in case we crash or stop
    }
    return job;
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

  }

  start() {

  }

  stop() {

  }
}