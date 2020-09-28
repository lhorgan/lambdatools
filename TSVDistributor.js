const Distributor = require('./distributor.js').Distributor;
const h = require('./util.js')._Util; // h for helpers

const lineByLine = require('n-readlines');

class TSVDistributor extends Distributor {
  constructor(config) {
    super(config);
    this.configure(config);
  }

  async configure(config) {
    await this.loadBackedUpJobs();
    
    console.log("configuring");
    this.readstream = new lineByLine(config.inputFile);
    this.separator = config.separator || "\t";
    this.metadataFields = new Set([]);

    this.fields = this.readstream.next().toString().trim().split(this.separator);
    let [readToLine, err] = await h.handle(h.redisGet(this.client, this.namespace, `admin_readToLine`));

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
      let jobsPendingCount = 0; // something
      let jobsToAdd = 5 * this.jobsPerSecond;
      let jobsAdded = 0;
      let line = null;

      console.log("ADDING JOBS");
      console.log(jobsPendingCount + ", " + jobsToAdd);

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

  writeJobs() {
    //console.log("writing jobs");
  }
}

let d = new TSVDistributor({
  retryCount: 0,
  relayIps: ["http://172.31.74.199:8081"],
  lambdaNames: ["hi"],
  jobsPerSecond: 3,
  namespace: "abctest",
  inputFile: "dummydata.csv",
  separator: ",",
  metadataFields: []
});
d.addRelaySocket("http://172.31.74.199:8081");