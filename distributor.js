const redis = require("redis");
const fetch = require('node-fetch');
const md5 = require("md5");
//const passport = require('passport');

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

    this.relaySockets = {};
    this.jobsInFlight = {};

    this.io = require('socket.io-client');
    console.log("setting up this.io");

    this.client.on("error", function (err) {
      console.error("Error " + err);
    });

    console.log("Loading backed up jobs from previous run...");
    this.loadBackedUpJobs();

    this.jobsToWrite = [];

    let writeInterval = setInterval(() => {
      this.writeJobs();
    }, 1000);
  }

  async loadBackedUpJobs() {

  }

  async addRelaySocket(relayURL) {
    console.log(`opening a connection to ${relayURL}...`);
    let socket = this.io(`${relayURL}/coordinator`);
    socket.on('connect', function(){
      console.log("WE ARE CONNECTED!");
    });
    this.relaySockets[relayURL] = socket;
    let sendingWork = false;

    socket.on("message", async (message) => {
      console.log("message received");
      console.log(message);
      if(message.type === "moreWork" && !sendingWork) {
        console.log("we need to send more work to relay " + relayURL);
        sendingWork = true;
        // send any jobs that are available, up to 50 per relay
        let jobsArray = [];
        for(let i = 0; i < this.jobsPerRelay; i++) {
          let nextJob = await this.getNextJob();
          if(nextJob === null) {
            break;
          }
          
          if(typeof(this.onNextJob) === "function") {
            this.onNextJob(nextJob);
          }

          jobsArray.push({"job": nextJob.job, 
                          //"metadata": nextJob.metadata,
                          "id": nextJob.id});
        }
        console.log("THE JOBS WE ARE SENDING");
        console.log(JSON.stringify(jobsArray));
        this.sendJobs(relayURL, jobsArray);
        sendingWork = false;
      }
      else if(message.type === "jobsComplete") {
        console.log(message);
        let workedJobs = message.jobsArray;
        for(let i = 0; i < workedJobs.length; i++) {
          if(workedJobs[i].status === "successs") {
            this.jobsToWrite.push(workedJobs[i]);
          }
          else if(workedJobs[i].status === "fail") {
            let originalJob = this.jobsInFlight[workedJobs[i].id];
            
            let [failCount, err] = await h.redisGet(this.client, this.namespace, workedJobs[i].id);
            if(err) {
              failCount = 0;
            }
            failCount = parseInt(failCount) || 0;
            
            if(failCount < this.retryCount) {
              h.redisSet(this.client, this.namespace, `${workedJobs[i].id}_failCount`, failCount + 1);
              await this.clearJobInFlight();
              this.addJob(originalJob.job, originalJob.metadata, originalJob.id); // we await clearing the job so we don't accidentally clear it again before it's been added
            }
            else {
              this.jobsToWrite.push(workedJobs[i]);
            }
          }
        }
      }
    });
    socket.on("disconnect", () => { // this will only happen if we take a relay offline
      console.log("we disconnected... woops");
      socket.disconnect(true);
      delete this.relaySockets[relayURL];
    });
  }

  // job={id, job, metadata}
  async setJobInFlight(job) {
    this.jobsInFlight[job.id] = job;
    await h.redisSetAdd(this.client, this.namespace, "jobsInFlight", job.id);
    await h.redisSet(this.client, this.namespace, job.id, job);
  }

  async clearJobInFlight(job) {
    this.jobsInFlight[job.id] = undefined;
    await h.redisSetRem(this.client, this.namespace, "jobsInFlight", job.id);
    await h.redisDel(this.client, this.namespace, job.id);
  }

  sendJobs(relayURL, jobsToSend) {
    fetch(relayURL + "/jobs", {
      method: "post",
      body: JSON.stringify(jobsToSend),
      headers: { 'Content-Type': 'application/json' }
    })
    .then(this.handleErrors)
    .then(response => response.json())
    .then(data => {
        console.log("jobs sent");
    })
    .catch(async (err) => {
        console.log(err);
        console.log(`Something seems to have gone wrong sending the jobs to relay node ${relayURL}...`);
        for(let i = 0; i < jobs.length; i++) {
          let originalJob = this.jobsInFlight[jobs[i].id];
          await this.clearJobInFlight(originalJob.id);
          this.addJob(originalJob.job, originalJob.metadata, originalJob.id);
        }
    });
  }
  
  async sleep(millis) {
    return new Promise((accept, reject) => {
      setTimeout(() => {
        accept();
      }, millis);
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
      this.setJobInFlight(job);
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
  addJob(job, metadata, id) {
    let jobID = id /*|| this.randomString()*/ || md5(JSON.stringify(job));
    console.log("ADDING JOB " + JSON.stringify(job));
    h.redisLPush(this.client, this.namespace, "jobs", {"job": job, "metadata": metadata, "id": jobID});
    return jobID;
  }

  start() {
    this.mainLoop();
  }

  stop() {
    console.log("Not yet... sorry");
  }
}

exports.Distributor = Distributor;