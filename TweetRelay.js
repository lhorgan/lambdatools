const AWS = require('aws-sdk');

const Relay = require('./relay.js').Relay;

/**
 * Function Name: ExpanderOctober1
 * Bucket name: expanderoct
 * Bucket key: functionCode
 * Timeout: 300
 */

class TweetRelay extends Relay {
  constructor() {
    super("8081");

    this.maxDepth = 1;
    this.lambdasInService = new Set();

    // we are targeting 1 job every minute on each Lambda we have
    // so, if we have 500 Lambdas, we should target a delay of 60000 / 500 = 120ms
    // split between ten relays, that's a delay of 1.2s
    this.delayBetweenJobs = (60000 / this.lambdasInService.size) * 10;

    this.mainLoop();
  }

  randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  async mainLoop() {
    while(true) {
      console.log(this.lambdaInfos);
      
      // let randomLambda = this.randomChoice(Object.keys(this.lambdaInfos));
      // let lambdaInfo = this.lambdaInfos[randomLambda];
      // console.log(lambdaInfo);

      if(this.queue.length < 20 && this.coordinatorSocket) {
        this.coordinatorSocket.send({type: "moreWork"});
      }

      let job = this.queue.pop();
      console.log("POPPED JOB " + JSON.stringify(job));
      if(job) {
        let lambdaInfo = job.job.lambdaInfo;
        console.log(lambdaInfo);
        this.invokeLambda(lambdaInfo, job);
      }
      await this.sleep(this.delayBetweenJobs);
    }
  }

  async scale() {}

  async invokeLambda(lambdaInfo, job) {
    console.log("We are invoking a Lambda!");

    AWS.config.update({region: lambdaInfo.region});
    var lambda = new AWS.Lambda();
    let payload = {"task": job};

    let params = {
      FunctionName: lambdaInfo.name,
      Payload: JSON.stringify(payload)
    };

    lambda.invoke(params, (err, data) => {
      if(err) {
        console.log("Lambda error response:");
        console.error(err);
      }
      else {
        console.log("Lambda response:");
        console.log(data);
        let results = JSON.parse(data.Payload);
        this.completedJobs.push(results);
      }
    });
  }
}

let tweetRelay = new TweetRelay();