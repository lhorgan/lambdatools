const express = require("express");
const TSVDistributor = require('./TSVDistributor.js').TSVDistributor;

class TweetDistributor extends TSVDistributor {
  constructor(config) {
    super(config);

    this.headersList = [];
    this.headersDict = {};
    this.headersCount = 500; // we'll go for 500 right now
    this.headersIndex = 0;

    this.app = express();
    this.app.use(express.json());
    this.server = require('http').createServer(this.app);
    this.port = 3050;
    this.listenHTTP();
  }

  listenHTTP() {
    console.log("SERVER LISTENING ON " + this.port);
    // Listen on the port specified in console args
    this.server.listen(this.port, ()  => {});

    /**
     */
    this.app.post("/credentials", async (req, res) => {
      console.log(req.body);

      let headers = req.body;
      if("x-csrf-token" in headers) {
        if(!(headers["x-csrf-token"] in this.headersDict)) {
          this.headersDict[headers["x-csrf-token"]] = headers;
          this.headersList[this.headersIndex] = headers;
          this.headersIndex = (this.headersIndex + 1) % this.headersCount;
        }
      }

      res.send({"status": 200});
    });
  }

  async writeJobs(jobsToWrite) {
    /*if(!this.outfileWriteStream || jobsToWrite.length < 1) {
      // the write stream will be initialized before we start sending jobs, so we won't lose any jobs
      //console.log("Hold your horses!  Write stream not ready yet!");
      return;
    }

    for(let i = 0; i < jobsToWrite.length; i++) {
      let result = jobsToWrite[i].result;
      let originalJob = jobsToWrite[i].originalJob;
      let jobArr = [jobsToWrite[i].status];
      if(jobsToWrite[i].status === "fail") {
        jobArr.push(jobsToWrite[i].result);
      }
      else {
        jobArr.push("");
      }
    }*/
    //console.log(jobsToWrite);
  }

  async addJob(job, metadata) {
    //console.log("ADDING JOB IN TD");
    //console.log(job);
    job.lambdaInfo = {name: "please", region: "us-east-1"};
    job.headers = this.randomChoice(this.headersCount);
    let jobID = super.addJob(job, metadata);
  }
}

let t = new TweetDistributor({
  retryCount: 3,
  lambdaNames: [{name: "please", region: "us-east-1"}],
  jobsPerSecond: 1,
  namespace: "rowboats",
  
  relayNamespace: "rowboats",
  inputFile: "/home/luke/Documents/lazer/achtung/id_handle_mapping.tsv", //"/home/luke/Downloads/wave11handles.tsv",//"/home/admin/bfd/august2020.tsv",
  outfile: "/home/luke/Documents/panelists.tsv",//"/home/admin/bfd/aug2020exp.tsv", 
  inputSeparator: "\t",
  outputSeparator: "\t",
  metadataFields: ["state"],
  resultFields: [],
  writeOriginalJob: true,
  writeMetadata: true,
  relayPort: "8081"
});

(async () => {
  await t.getRelays();
  //console.log("HERE ARE THE RELAYS");
  //console.log(Object.keys(t.relaySockets));
})();