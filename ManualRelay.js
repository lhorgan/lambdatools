const AWS = require('aws-sdk');

const Relay = require('./relay.js').Relay;

/**
 * Function Name: ExpanderOctober1
 * Bucket name: expanderoct
 * Bucket key: functionCode
 * Timeout: 300
 */

class ManualRelay extends Relay {
  constructor() {
    super("8081");

    //this.relayURLs = ["http://54.208.5.41:8081"];
    //this.lambdaInfos = {"ExpanderOctober1": {"name": "ExpanderOctober1", "region": "us-east-1"}};
    //this.invokeLambdas([this.lambdaInfos["ExpanderOctober1"]]);
  }

  invokeLambda(lambdaInfo) {
    // console.log("We are invoking a Lambda!");

    // AWS.config.update({region: lambdaInfo.region});
    // var lambda = new AWS.Lambda();
    // let payload = {"relayURLs": this.relayURLs};

    // let params = {
    //   FunctionName: lambdaInfo.name,
    //   Payload: JSON.stringify(payload)
    // };

    // //console.log("INVOKING WITH PARAMS ");
    // //console.log(params);

    // lambda.invoke(params, (err, data) => {
    //   if(err) {
    //     console.log("Lambda error response:");
    //     console.error(err);
    //   }
    //   else {
    //     console.log("Lambda response:");
    //     console.log(data);
    //   }
    // });
  }
}

let manualRelay = new ManualRelay();