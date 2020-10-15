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

    this.jobStartTimes = [];
    this.jobTimeout = 30000; // todo, make this adjustable

    this.relaySockets = {};
    this.jobsInFlight = {};

    this.io = require('socket.io-client');
    //console.log("setting up this.io");

    this.client.on("error", function (err) {
      console.error("Error " + err);
    });

    this.jobsToWrite = [];

    this.writeJobsLoop();
    this.expireJobsLoop();

    this.dupCount = 0; // again, bookkeeping only

    this.jobsCompletedCount = 0;
  }

  async expireJobsLoop() {
    setInterval(async () => {
      let [jc1, jc2, jc3] = await this.getJobsCounts();
      console.log(`JOB COUNTS: ${jc1} ${jc2} ${jc3}`);
    }, 5000);

    while(true) {
      let currTime = Date.now();

      let i = 0;
      //console.log("\n\n");
      //console.log(this.jobsInFlight);
      //console.log(this.jobStartTimes);
      //console.log("\n\n");

      let allJobsExpired = true;
      while(i < this.jobStartTimes.length) {
        let jobID = this.jobStartTimes[i].id;
        let startTime = this.jobStartTimes[i].time;
        //console.log("CURR TIME START TIME: " + (currTime - startTime));
        if(currTime - startTime < this.jobTimeout) {
          this.jobStartTimes = this.jobStartTimes.slice(i);
          allJobsExpired = false;
          break;
        }
        else {
          //console.log(jobID + " must be complete");
          if(jobID in this.jobsInFlight) { // this job has expired and is probably lost
            console.error(jobID + " has been gone too long.  Timed out.  Probably lost.");
            let originalJob = this.jobsInFlight[jobID];
            await this.clearJobInFlight(jobID);
            await this.addJob(originalJob.job, originalJob.metadata, originalJob.id);
          }
        }

        i++
      }

      if(allJobsExpired) {
        //console.log("All jobs have expired.")
        this.jobStartTimes = [];
      }

      await this.sleep(10000);
    }
  }

  async writeJobsLoop() {
    while(true) {
      console.log("Time to write some jobs to file!");
      //console.log(JSON.stringify(this.jobsToWrite));
      //console.log("IN FLIGHT")
      //console.log(this.jobsInFlight);
      //console.log("\n\n");
      let jobs = [];
      for(let i = 0; i < this.jobsToWrite.length; i++) {
        let id = this.jobsToWrite[i].id;
        let result = this.jobsToWrite[i].result;
        //console.log("PSSST RESULT FOR " + this.jobsToWrite[i].id);
        //console.log(result);
        let originalJob = this.jobsInFlight[id];
        if(!originalJob) {
          //console.log("It's possible that this job is from a previous run....");
          continue;
        }
        jobs.push({originalJob: originalJob, result: result, id: id, status: this.jobsToWrite[i].status});
      }
      //console.log(jobs);
      let jobsToClear = this.jobsToWrite;
      this.jobsToWrite = [];
      console.log("JOBS TO CLEAR: " + jobsToClear.length)

      await this.writeJobs(jobs);
      
      for(let i = 0; i < jobsToClear.length; i++) {
        await this.clearJobInFlight(jobsToClear[i].id);
        await this.completeJob(jobsToClear[i].id);
        console.log("awaiting...");
      }
      await this.sleep(1000);
    }
  }

  async completeJob(jobID) {
    this.jobsCompletedCount++;
    console.log("COMPLETING JOB " + jobID + ": " + this.jobsCompletedCount);
    await h.redisSetRem(this.client, this.namespace, "allIncompleteJobIDs", jobID);
  }

  async loadBackedUpJobs() {
    //console.log("Loading backed up jobs...");

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
      //console.log("Loading backed up job with id " + backedUpJobID);

      let [backedUpJob, buErr] = await h.attempt(h.redisGet(this.client, this.namespace, backedUpJobID));
      if(buErr) {
        console.error(err);
        continue;
      }
      else if(!backedUpJob) {
        console.error(`No such job ${backedUpJobID}`);
        continue;
      }
      //console.log("Here is the backed up job");
      //console.log(backedUpJob);
      backedUpJob = JSON.parse(backedUpJob);
      await this.addJob(backedUpJob.job, backedUpJob.metadata, backedUpJob.id);
    } while(backedUpJobID !== null);
  }

  async addRelaySocket(relayURL) {
    let completedJobs = [];

    //this.sendLambdas(relayURL);
    //this.sendRelays(relayURL);

    //console.log(`opening a connection to ${relayURL}...`);
    let socket = this.io(`${relayURL}/coordinator`);
    socket.on('connect', function(){
      //console.log("WE ARE CONNECTED!");
    });
    this.relaySockets[relayURL] = socket;
    let sendingWork = false;

    socket.on("message", async (message) => {
      //console.log("message received");
      //console.log(message);
      if(message.type === "moreWork" && !sendingWork) {
        //console.log("we need to send more work to relay " + relayURL);
        sendingWork = true;
        // send any jobs that are available, up to 50 per relay
        let jobsArray = [];
        for(let i = 0; i < this.jobsPerRelay; i++) {
          let nextJob = await this.getNextJob();
          //console.log("THE NEXT JOB WE POPPED: " + JSON.stringify(nextJob));
          //console.log("TOTAL JOB COUNT: " + (await this.getJobsCount()));
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
        //console.log("THE JOBS WE ARE SENDING");
        //console.log(JSON.stringify(jobsArray));
        this.sendJobs(relayURL, jobsArray);
        sendingWork = false;
      }
      else if(message.type === "jobsComplete") {
        //console.log("JOBS COMPLETE!");
        //console.log(message);
        let workedJobs = message.jobsArray;
        for(let i = 0; i < workedJobs.length; i++) {
          //console.log("WORKED JOB: " + JSON.stringify(workedJobs[i]));
          //console.log(workedJobs[i].status);
          if(workedJobs[i].status === "success") {
            //console.log("Pushing to jobs to write...");
            //console.log(`Adding successul ${workedJobs[i].id} to write`);
            this.jobsToWrite.push(workedJobs[i]);
            completedJobs++;
            //console.log(completedJobs);
          }
          else if(workedJobs[i].status === "fail") {
            //console.log(workedJobs[i].id + " has failed, sadly.");
            let originalJob = this.jobsInFlight[workedJobs[i].id];
            
            let [failCount, err] = await h.attempt(h.redisGet(this.client, this.namespace, `${workedJobs[i].id}_failCount`));
            if(err) {
              failCount = 0;
            }
            failCount = parseInt(failCount) || 0;
            //console.log(`Fail count for failed job ${workedJobs[i].id} is now at ${failCount}`);
            //console.log(`Original Job\n${JSON.stringify(originalJob)}\n`);
            
            if(failCount < this.retryCount) {
              await h.redisSet(this.client, this.namespace, `${workedJobs[i].id}_failCount`, failCount + 1);
              await this.clearJobInFlight(originalJob.id);
              //console.log(`Adding failed ${workedJobs[i].id} to write`);
              await this.addJob(originalJob.job, originalJob.metadata, originalJob.id); // we await clearing the job so we don't accidentally clear it again before it's been added
            }
            else {
              completedJobs++;
              //console.log("NOW AT " + completedJobs + " completed jobs!");
              this.jobsToWrite.push(workedJobs[i]);
              console.log(`Adding weird ${workedJobs[i].id} to write`);
              console.log(workedJobs[i]);
            }
          }
        }
      }
    });
    socket.on("disconnect", () => { // this will only happen if we take a relay offline
      //console.log("we disconnected... woops");
      socket.disconnect(true);
      delete this.relaySockets[relayURL];
    });
  }

  // job={id, job, metadata}
  async setJobInFlight(job) {
    this.jobsInFlight[job.id] = job;
    await h.redisSetAdd(this.client, this.namespace, "jobsInFlight", job.id);
    await h.redisSet(this.client, this.namespace, job.id, job);
    this.jobStartTimes.push({time: Date.now(), id: job.id});
  }

  async clearJobInFlight(jobID) {
    delete this.jobsInFlight[jobID];
    console.log("DELETING " + jobID);
    let [res1, err1] = await h.attempt(h.redisSetRem(this.client, this.namespace, "jobsInFlight", jobID));
    if(err1) {
      //console.log("Woops, couldn't remove job " + jobID + " from the set.");
      console.error(err1);
    }
    let [res2, err2] = await h.attempt(h.redisDel(this.client, this.namespace, jobID));
    if(err2) {
      //console.log("Woops, couldn't remove job " + jobID + " from the database.");
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
        //console.log("jobs sent");
    })
    .catch(async (err) => {
        //console.log(err);
        //console.log(`Something seems to have gone wrong sending the jobs to relay node ${relayURL}...`);
        for(let i = 0; i < jobs.length; i++) {
          let originalJob = this.jobsInFlight[jobs[i].id];
          await this.clearJobInFlight(originalJob.id);
          this.addJob(originalJob.job, originalJob.metadata, originalJob.id);
        }
    });
  }

  sendLambdas(relayURL) {
    //console.log("LAMBDA NAMES!");
    //console.log(this.lambdaNames);
    fetch(relayURL + "/lambdas", {
      method: "post",
      body: JSON.stringify({"lambdas": this.lambdaNames}),
      headers: {
        "Content-Type": "application/json"
      }
    })
    .then(data => {
      //console.log("Lambas sent");
    })
    .catch(err => {
      console.error(err);
    });
  }

  sendRelays(relayURL) { // make the relay aware of all its bretheren
    //console.log("THE URL WE ARE FETCHING " + relayURL);
    //console.log("THE RELAYS WE HAVE");
    //console.log(Object.keys(this.relaySockets));
    fetch(relayURL + "/relayURLs", {
      method: "post",
      body: JSON.stringify({"relayURLs": Object.keys(this.relaySockets)}),
      headers: {
        "Content-Type": "application/json"
      }
    })
    .then(data => {
      //console.log("Sent relay URLs");
      //console.log(data);
    })
    .catch(err => {
      console.error(err);
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
    //console.log("todo... not yet implemented");
  }

  async getNextJob() {
    let [job, err] = await h.attempt(h.redisLPop(this.client, this.namespace, "jobs"));
    //console.log(job);
    
    if(err) {
      console.error(err);
      return null;
    }

    if(job) {
      await this.setJobInFlight(job);
    }
    //console.log("POPPED A JOB LIKE");
    //console.log(JSON.stringify(job));
    return job;
  }

  async getJobsCounts() {
    let [count1, err1] = await h.attempt(h.redisLen(this.client, this.namespace, "jobs"));
    let [count2, err2] = await h.attempt(h.redisLen(this.client, this.namespace, "jobsInFlight"));
    let [count3, err3] = await h.attempt(h.redisLen(this.client, this.namespace, "allIncompleteJobIDs"));
    // if(err) {
    //   console.error(err);
    //   return null;
    // }
    if(err1) {
      console.error(err1);
    }

    return [count1, count2, count3];
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
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // job is the job itself, what you want sent to be processed
// metadata is any information you want to be associated with the job
  async addJob(job, metadata, id) {
    let jobID = id /*|| this.randomString()*/ || md5(JSON.stringify(job));
    let jobIsDuplicate = await h.redisSetIsMember(this.client, this.namespace, "allIncompleteJobIDs", jobID);
    if(!id && jobIsDuplicate) { // reading in a fresh job only, hence id check
      this.dupCount++;
      console.log("Job " + jobID + " already exists!  We have id'd " + this.dupCount + " duplicates!");
      return;
    }

    //console.log(JSON.stringify(jobID));
    //console.log("Adding job with id " + jobID);

    await h.redisSetAdd(this.client, this.namespace, "allIncompleteJobIDs", jobID);
    // FIRST, MAKE SURE THIS JOB ISN'T A DUPLICATE (which could happen a bunch of ways that aren't my fault!)
    //console.log("\nADDING JOB " + jobID + " " + JSON.stringify(job) + "\n");
    await h.redisLPush(this.client, this.namespace, "jobs", {"job": job, "metadata": metadata, "id": jobID});
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
        //console.log(`Type: ${instance.InstanceType}`);
        //console.log(`Private IP: ${instance.PrivateIpAddress}`);
        //console.log(`Public URL: ${instance.PublicDnsName || 'None'}`);
        //console.log("\n");

        //this.addRelaySocket(`http://${instance.PrivateIpAddress}:${this.relayPort}`);
        this.addRelaySocket(`http://${instance.PublicDnsName}:${this.relayPort}`);
      }
    }

    for(let relayURL in this.relaySockets) {
      this.sendLambdas(relayURL);
      this.sendRelays(relayURL);
    }
  }

  stop() {
    //console.log("Not yet... sorry");
  }

  async writeJobs(jobs) {
    // pass
  }
}

exports.Distributor = Distributor;