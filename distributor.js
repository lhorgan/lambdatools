const redis = require("redis");
const fetch = require('node-fetch');
const md5 = require("md5");
//const passport = require('passport');

const h = require('./util.js')._Util; // h for helpers
const EC2 = require("./ec2_launcher").EC2;

class Distributor {
  constructor(config) {
    this.retryCount = config.retryCount;
    this.onSuccess = config.onSuccess;
    this.onFail = config.onFail;
    this.jobToRow = config.jobToRow;
    this.relayNames = config.relayNames;
    this.relayPort = config.relayPort;
    this.lambdaNames = config.lambdaNames;
    this.jobsPerSecond = config.jobsPerSecond;
    this.namespace = config.namespace;
    this.relayNamespace = config.relayNamespace;
    this.client = redis.createClient();
    this.jobsPerRelay = 50; // jobs per relay per request
    this.ec2Util = new EC2();

    this.relaySockets = {};
    this.jobsInFlight = {};

    this.io = require('socket.io-client');
    console.log("setting up this.io");

    this.client.on("error", function (err) {
      console.error("Error " + err);
    });

    this.jobsToWrite = [];

    this.writeJobsLoop();
  }

  async writeJobsLoop() {
    while(true) {
      console.log("Time to write some jobs to file!");
      console.log(JSON.stringify(this.jobsToWrite));
      console.log("IN FLIGHT")
      console.log(this.jobsInFlight);
      console.log("\n\n");
      let jobs = [];
      for(let i = 0; i < this.jobsToWrite.length; i++) {
        let id = this.jobsToWrite[i].id;
        let result = this.jobsToWrite[i].result;
        console.log("PSSST RESULT FOR " + this.jobsToWrite[i].id);
        console.log(result);
        let originalJob = this.jobsInFlight[id];
        if(!originalJob) {
          console.log("It's possible that this job is from a previous run....");
          continue;
        }
        jobs.push({originalJob: originalJob, result: result, id: id});
      }
      console.log(jobs);
      this.jobsToWrite = [];

      await this.writeJobs(jobs);

      for(let i = 0; i < this.jobsToWrite.length; i++) {
        this.clearJobInFlight(this.jobsToWrite[i].id);
      }
      await this.sleep(1000);
    }
  }

  async loadBackedUpJobs() {
    console.log("Loading backed up jobs...");

    //await h.redisSetAdd(this.client, this.namespace, "jobsInFlight", job.id);

    let backedUpJobID = null;
    let err = null;
    do {
      [backedUpJobID, err] = await h.attempt(h.redisSetPop(this.client, this.namespace, "jobsInFlight"));
      if(err) {
        console.error(err);
        continue;
      }
      else if(backedUpJobID === null) {
        break;
      }
      console.log("Loading backed up job with id " + backedUpJobID);

      let [backedUpJob, buErr] = await h.attempt(h.redisGet(this.client, this.namespace, backedUpJobID));
      if(buErr) {
        console.error(err);
        continue;
      }
      else if(!backedUpJob) {
        console.error(`No such job ${backedUpJobID}`);
        continue;
      }
      console.log("Here is the backed up job");
      console.log(backedUpJob);
      backedUpJob = JSON.parse(backedUpJob);
      this.addJob(backedUpJob.job, backedUpJob.metadata, backedUpJob.id);
    } while(backedUpJobID !== null);
  }

  async addRelaySocket(relayURL) {
    //this.sendLambdas(relayURL);

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
          console.log("THE NEXT JOB WE POPPED: " + JSON.stringify(nextJob));
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
        console.log("JOBS COMPLETE!");
        console.log(message);
        let workedJobs = message.jobsArray;
        for(let i = 0; i < workedJobs.length; i++) {
          console.log(workedJobs[i]);
          console.log(workedJobs[i].status);
          if(workedJobs[i].status === "success") {
            console.log("Pushing to jobs to write...");
            console.log(`Adding successul ${workedJobs[i].id} to write`);
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
              await this.clearJobInFlight(originalJob.id);
              console.log(`Adding failed ${workedJobs[i].id} to write`);
              this.addJob(originalJob.job, originalJob.metadata, originalJob.id); // we await clearing the job so we don't accidentally clear it again before it's been added
            }
            else {
              this.jobsToWrite.push(workedJobs[i]);
              console.log(`Adding weird ${workedJobs[i].id} to write`);
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

  async clearJobInFlight(jobID) {
    delete this.jobsInFlight[jobID];
    console.log("DELETING " + jobID);
    let [res1, err1] = await h.attempt(h.redisSetRem(this.client, this.namespace, "jobsInFlight", jobID));
    if(err1) {
      console.log("Woops, couldn't remove job " + jobID + " from the set.");
      console.error(err1);
    }
    let [res2, err2] = await h.attempt(h.redisDel(this.client, this.namespace, jobID));
    if(err2) {
      console.log("Woops, couldn't remove job " + jobID + " from the database.");
      console.error(err2);
    }
  }

  sendJobs(relayURL, jobsToSend) {
    let body = {jobs: jobsToSend};
    body["relayURLs"] = Object.keys(this.relaySockets); // relays need to know all the relay URLs

    fetch(relayURL + "/jobs", {
      method: "post",
      body: JSON.stringify(body),
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

  sendLambdas(relayURL) {
    console.log("LAMBDA NAMES!");
    console.log(this.lambdaNames);
    fetch(relayURL + "/lambdas", {
      method: "post",
      body: JSON.stringify({"lambdas": this.lambdaNames})
    })
    .then(data => {
      console.log("Lambas sent");
    })
    .catch(err => {
      console.error(err);
    })
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
    let [job, err] = await h.attempt(h.redisLPop(this.client, this.namespace, "jobs"));
    console.log(job);
    
    if(err) {
      console.error(err);
      return null;
    }

    if(job) {
      this.setJobInFlight(job);
    }
    console.log("POPPED A JOB LIKE");
    console.log(JSON.stringify(job));
    return job;
  }

  async getJobsCount() {
    let [count, err] = await h.attempt(h.redisLen(this.client, this.namespace, "jobs"));
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

  async getRelays() {
    let [instances, err] = await h.attempt(this.ec2Util.describeInstances([
      {
        Name: `tag:Name`,
        Values: [`${this.relayNamespace}-relay*`]
      },
      {
        Name: 'instance-state-name',
        Values: ["running"]
      },
    ]));

    if(err) {
      console.error("Could not load relays.  Aborting.");
      return;
    }

    for(let i = 0; i < instances.Reservations.length; i++) {
      for(let j = 0; j < instances.Reservations[i].Instances.length; j++) {
        let instance = instances.Reservations[i].Instances[j];
        console.log(`Type: ${instance.InstanceType}`);
        console.log(`Private IP: ${instance.PrivateIpAddress}`);
        console.log(`Public URL: ${instance.PublicDnsName || 'None'}`);
        console.log("\n");

        this.addRelaySocket(`http://${instance.PrivateIpAddress}:${this.relayPort}`);
      }
    }
  }

  stop() {
    console.log("Not yet... sorry");
  }

  async writeJobs(jobs) {
    // pass
  }
}

exports.Distributor = Distributor;