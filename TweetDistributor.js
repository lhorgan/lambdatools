const TSVDistributor = require('./TSVDistributor.js').TSVDistributor;

class TweetDistributor extends TSVDistributor {
  constructor(config) {
    super(config);

    this.headers = [];
  }

  async headersLoop() {
    
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
    console.log(jobsToWrite);
  }
}

let t = new TweetDistributor({
  retryCount: 3,
  lambdaNames: [{name: "chrometweets1", region: "us-east-1"}],
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
  console.log("HERE ARE THE RELAYS");
  console.log(Object.keys(t.relaySockets));
})();