const Distributor = require('./distributor.js').Distributor;
const h = require('./util.js')._Util; // h for helpers

const lineByLine = require('n-readlines');
const fs = require("fs");

class TSVDistributor extends Distributor {
  constructor(config) {
    super(config);

    this.configure(config);
  }

  async configure(config) {
    await this.loadBackedUpJobs();
    
    console.log("configuring");
    this.readstream = new lineByLine(config.inputFile);
    this.inputSeparator = config.inputSeparator || "\t";
    this.outputSeparator = config.outputSeparator || "\t";
    
    this.metadataFields = config.metadataFields;
    this.metadataFieldsSet = new Set(this.metadataFields);
    this.resultFields = config.resultFields;
    this.resultFieldsSet = new Set(this.resultFields);
    
    let writeHeader = fs.existsSync(config.outfile);
    this.outfileWriteStream = fs.createWriteStream(config.outfile, {flags: "a"});
    this.fields = this.readstream.next().toString().trim().split(this.inputSeparator);
    if(writeHeader) {
      let headerArr = [];
      for(let i = 0; i < this.resultFields.length; i++) {
        headerArr.push(this.resultFields[i]);
      }
      if(this.writeOriginalJob) {
        for(let i = 0; i < this.fields.length; i++) {
          if(this.metadataFieldsSet.has(this.fields[i])) {
            if(this.writeMetadata) {
              headerArr.push(this.fields[i]);
            }
          }
          else {
            headerArr.push(this.fields[i]);
          }
        }
      }
      this.outfileWriteStream.write(headerArr.join("\t")  + "\r\n");
    }

    let [readToLine, err] = await h.attempt(h.redisGet(this.client, this.namespace, `admin_readToLine`));

    console.log("We have read to line " + readToLine);

    if(err) {
      readToLine = 0;
    }

    readToLine = parseInt(readToLine);
    if(isNaN(readToLine)) {
      readToLine = 0;
    }

    this.seek(readToLine); // seeks to the appropriate line
    this.addJobsLoop();
  }

  seek(readToLine) {
    let linesRead = 0;
    let line;
    while((linesRead < readToLine) && (line = this.readstream.next())) {
      linesRead++;
    }
    this.linesRead = linesRead;
  }

  async addJobsLoop() {
    let jobsInterval = setInterval(async () => {
      let jobsPendingCount = Object.keys(this.jobsInFlight).length; // something
      let jobsToAdd = 5 * this.jobsPerSecond;
      let jobsAdded = 0;
      let line = null;

      console.log("ADDING JOBS");
      console.log("PENDING, ADDING:" + jobsPendingCount + ", " + jobsToAdd);

      if(jobsPendingCount < jobsToAdd) {
        while((line = this.readstream.next()) && (jobsAdded < jobsToAdd)) {
          let rawData = line.toString().trim().split(this.inputSeparator);
          console.log(rawData);
          let job = {};
          let metadata = {};
          for(let i = 0; i < this.fields.length; i++) {
            if(this.metadataFieldsSet.has(this.fields[i])) {
              metadata[this.fields[i]] = rawData[i];
            }
            else {
              job[this.fields[i]] = rawData[i];
            }
          }
          this.addJob(job, metadata);
          jobsAdded++;
          this.linesRead++; // another line has been read
        }
        if(!line) {
          this.readAllLines = true;
          clearInterval(jobsInterval);
        }

        h.redisSet(this.client, this.namespace, `admin_readToLine`, this.linesRead); // once all jobs for the second have been posted, so as not to slam the database
      }
    }, 1000);
  }

  onNextJob(job) {
    if(this.readAllLines && job === null) {
      console.log("no jobs left!");
    }
  }

  async writeJobs(jobsToWrite) {
    console.log("well, we should be writing:");
    console.log(JSON.stringify(jobsToWrite));
    let jobsArr = [];

    for(let i = 0; i < jobsToWrite.length; i++) {
      console.log("JOB WE ARE ABOUT TO WRITE");
      console.log(jobsToWrite[i]);
      let result = jobsToWrite[i].result;
      let originalJob = jobsToWrite[i].originalJob;
      let jobArr = [];
      for(let j = 0; j < this.resultFields.length; j++) {
        if(result && this.resultFields[j] in result) {
          console.log("Adding " + this.resultFields[j] + " to the list...");
          jobArr.push(result[this.resultFields[j]]);
        }
        else {
          jobArr.push("");
        }
      }
      console.log("Neato");
      console.log(this.metadataFieldsSet);
      for(let j = 0; j < this.fields.length; j++) {
        if(this.metadataFieldsSet.has(this.fields[j])) {
          if(this.writeMetadata) {
            if(this.fields[j] in originalJob) {
              jobArr.push(originalJob[this.fields[j]]);
            }
            else {
              jobArr.push("");
            }
          }
        }
        else {
          if(this.fields[j] in originalJob) {
            jobArr.push(originalJob[this.fields[j]]);
          }
          else {
            jobArr.push("");
          }
        }
      }
      jobsArr.push(jobArr.join(this.outputSeparator));
    }
    this.outfileWriteStream.write(jobsArr.join("\r\n"));
  }
}

let d = new TSVDistributor({
  retryCount: 0,
  lambdaNames: [{name: "TestFunc120", region: "us-east-1"}],
  jobsPerSecond: 1,
  namespace: "abctest",
  relayNamespace: "whylord",
  inputFile: "merged.tsv",
  outfile: "results.tsv", 
  inputSeparator: "\t",
  outputSeparator: "\t",
  metadataFields: ["gender", "age", "race", "language", "uses_twitter", "which_handle", "original_lacked_at", "original_had_space", "masked_id", "retrieval_status"],
  resultFields: ["dummy"],
  writeOriginalJob: true,
  writeMetadata: false,
  relayPort: "8081"
});
d.getRelays();
// setTimeout(() => {
//   d.writeJobs([{"originalJob":{"job":{"handle":"@michaelloget","state":"New York","gender":"male","age":"27","race":"African American","language":"English","uses_twitter":"no or no answer","which_handle":"3","original_lacked_at":"TRUE","original_had_space":"FALSE","masked_id":"11847","retrieval_status":"success","handle_as_per_twitter":"MichaelLoget","name_as_per_twitter":"Michael Loget","location_as_per_twitter":"","tweet_count":"23","following":"63","followers":"12"},"metadata":{},"id":"9c4f2168a4f5298665921fd2d4e31d74"},"result":{"dummy":0.6400064357611768},"id":"9c4f2168a4f5298665921fd2d4e31d74"}]);
// }, 2000);