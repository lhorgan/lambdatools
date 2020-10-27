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
    
    //console.log("configuring");
    this.readstream = new lineByLine(config.inputFile);
    this.inputSeparator = config.inputSeparator || "\t";
    this.outputSeparator = config.outputSeparator || "\t";
    
    this.metadataFields = config.metadataFields;
    this.metadataFieldsSet = new Set(this.metadataFields);
    this.resultFields = config.resultFields;
    this.resultFieldsSet = new Set(this.resultFields);
    this.writeOriginalJob = config.writeOriginalJob;
    this.writeMetadata = config.writeMetadata;
    
    let writeHeader = !fs.existsSync(config.outfile);
    //console.log("Write header: " + writeHeader);
    this.outfileWriteStream = fs.createWriteStream(config.outfile, {flags: "a"});
    this.fields = this.readstream.next().toString().trim().split(this.inputSeparator);

    //console.log("OUR FIELDS");
    //console.log(this.fields);

    if(writeHeader) {
      //console.log("OKAY, GOOD");
      let headerArr = ["status", "error"];
      for(let i = 0; i < this.resultFields.length; i++) {
        headerArr.push(this.resultFields[i]);
      }
      //console.log("HEADER ARR: " + JSON.stringify(headerArr));
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
      //console.log("WRITING THE HEADER");
      //console.log(headerArr);
    }

    let [readToLine, err] = await h.attempt(h.redisGet(this.client, this.namespace, `admin_readToLine`));

    //console.log("We have read to line " + readToLine);

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
    console.log("Seeking....");
    let linesRead = 0;
    let line;
    while((linesRead < readToLine) && (line = this.readstream.next())) {
      linesRead++;
    }
    this.linesRead = linesRead;
  }

  async addJobsLoop() {
    let endJobsLoop = false;
    let totalJobsAdded = 0; // just for bookkeeping

    while(!endJobsLoop) {
      console.log(`TOTAL JOBS ADDED: ${totalJobsAdded}`);

      let jobsPendingCount = await this.getJobsCount();
      let jobsToAdd = 500;//5 * this.jobsPerSecond;
      let jobsAdded = 0;
      let line = null;

      //console.log("ADDING JOBS");
      //console.log("PENDING, ADDING:" + jobsPendingCount + ", " + jobsToAdd);

      if(jobsPendingCount < jobsToAdd) {
        while((jobsAdded < jobsToAdd) && (line = this.readstream.next())) { 
          console.log("LINE " + line.toString());
          // the && used to be in the other order, but that meant a line got skipped 
          // if the first condition (ie this.readstream.next() was true but the second ws false)
          let rawData = line.toString().trim().split(this.inputSeparator);
          //console.log(rawData);
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
          await this.addJob(job, metadata);
          totalJobsAdded++;
          jobsAdded++;
          this.linesRead++; // another line has been read
        }
        if(!line) {
          console.log("LINE (done):");
          console.log(line);
          this.readAllLines = true;
          endJobsLoop = true;
          console.log("all lines read...");
        }
        h.redisSet(this.client, this.namespace, `admin_readToLine`, this.linesRead); // once all jobs for the second have been posted, so as not to slam the database
      }
      await this.sleep(1000);
    }
  }

  onNextJob(job) {
    if(this.readAllLines && job === null) {
      //console.log("no jobs left!");
    }
  }

  async writeJobs(jobsToWrite) {
    if(!this.outfileWriteStream || jobsToWrite.length < 1) {
      // the write stream will be initialized before we start sending jobs, so we won't lose any jobs
      //console.log("Hold your horses!  Write stream not ready yet!");
      return;
    }

    //console.log("well, we should be writing:");
    //console.log(JSON.stringify(jobsToWrite));
    let jobsArr = [];

    for(let i = 0; i < jobsToWrite.length; i++) {
      //console.log("JOB WE ARE ABOUT TO WRITE");
      //console.log(jobsToWrite[i]);
      let result = jobsToWrite[i].result;
      let originalJob = jobsToWrite[i].originalJob;
      let jobArr = [jobsToWrite[i].status];
      if(jobsToWrite[i].status === "fail") {
        jobArr.push(jobsToWrite[i].result);
      }
      else {
        jobArr.push("");
      }
      
      for(let j = 0; j < this.resultFields.length; j++) {
        console.log(jobsToWrite[i]);
        console.log("~~~~~");
        if(jobsToWrite[i].status !== "fail" && result && this.resultFields[j] in result) {
          //console.log("Adding " + this.resultFields[j] + " to the list...");
          jobArr.push(result[this.resultFields[j]]);
        }
        else {
          jobArr.push("");
        }
      }
      //console.log("Neato");
      //console.log(this.metadataFieldsSet);
      //console.log("So, here's the original job: ");
      //console.log(this.metadataFieldsSet);
      //console.log(JSON.stringify(originalJob));
      for(let j = 0; j < this.fields.length; j++) {
        //console.log(this.fields[j]);
        if(this.metadataFieldsSet.has(this.fields[j])) {
          if(this.writeMetadata) {
            if(this.fields[j] in originalJob.metadata) {
              jobArr.push(originalJob.metadata[this.fields[j]]);
            }
            else {
              jobArr.push("");
            }
          }
        }
        else {
          if(this.fields[j] in originalJob.job) {
            jobArr.push(originalJob.job[this.fields[j]]);
          }
          else {
            jobArr.push("");
          }
        }
      }
      //console.log("THE LINE WE ARE WRITING");
      //console.log(jobArr.join(this.outputSeparator));
      jobArr.push(originalJob.id);
      jobsArr.push(jobArr.join(this.outputSeparator));
    }
    this.outfileWriteStream.write(jobsArr.join("\r\n") + "\r\n");
  }
}

// let d = new TSVDistributor({
//   retryCount: 3,
//   lambdaNames: [{name: "TestFunc120", region: "us-east-1"}],
//   jobsPerSecond: 1,
//   namespace: "abctest",
//   relayNamespace: "whylord",
//   inputFile: "small.tsv",
//   outfile: "results.tsv", 
//   inputSeparator: "\t",
//   outputSeparator: "\t",
//   metadataFields: ["gender", "age", "race", "language", "uses_twitter", "which_handle", "original_lacked_at", "original_had_space", "masked_id", "retrieval_status"],
//   resultFields: ["dummy"],
//   writeOriginalJob: true,
//   writeMetadata: false,
//   relayPort: "8081"
// });

let d = new TSVDistributor({
  retryCount: 3,
  lambdaNames: [{name: "ExpanderOctober1", region: "us-east-1"}],
  jobsPerSecond: 1,
  namespace: "rowboats",
  relayNamespace: "rowboats",
  inputFile: "/home/admin/bfd/sep2020.tsv", //"/home/admin/bfd/august2020.tsv",
  outfile: "/home/admin/bfd/sep2020exp.tsv", //"/home/admin/bfd/aug2020exp.tsv", 
  inputSeparator: "\t",
  outputSeparator: "\t",
  metadataFields: [],
  resultFields: ["expandedURL"],
  writeOriginalJob: true,
  writeMetadata: true,
  relayPort: "8081"
});

(async () => {
  await d.getRelays();
  console.log("HERE ARE THE RELAYS");
  console.log(Object.keys(d.relaySockets));
  //d.sendLambdas();
  //d.sendRelays();
})();
// setTimeout(() => {
//   d.writeJobs([{"originalJob":{"job":{"handle":"@michaelloget","state":"New York","gender":"male","age":"27","race":"African American","language":"English","uses_twitter":"no or no answer","which_handle":"3","original_lacked_at":"TRUE","original_had_space":"FALSE","masked_id":"11847","retrieval_status":"success","handle_as_per_twitter":"MichaelLoget","name_as_per_twitter":"Michael Loget","location_as_per_twitter":"","tweet_count":"23","following":"63","followers":"12"},"metadata":{},"id":"9c4f2168a4f5298665921fd2d4e31d74"},"result":{"dummy":0.6400064357611768},"id":"9c4f2168a4f5298665921fd2d4e31d74"}]);
// }, 2000);