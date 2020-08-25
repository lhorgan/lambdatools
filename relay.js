class Relay {
  constructor() {
    let express = require("express");
    let bodyParser = require("body-parser");

    this.app = express();
    this.AWS = require("aws-sdk");

    app.use(bodyParser.json());
  }

  configure() {
    app.listen(8081, function () {
      console.log("App listening on port 8081");
    });

    app.post("/urls", (req, res) => {
      console.log("jobs received");
      console.log(req.body);
      let jobsArray = req.body;
      this.sendsJobToLambda(jobsArray, (lambdaResp) => {
        res.send(JSON.stringify(lambdaResp));
      });
    });
  }
  
  sendJobsToLambda(jobsArray, cb) {
    let lambdaResps = [];

    for(let i = 0; i < jobsArray.length; i++) {
      let job = jobsArray[i];

      AWS.config.update({region: job.region});
      var lambda = new AWS.Lambda();
      
      let payload = job.job;

      var params = {
        FunctionName: job.name,
        Payload: JSON.stringify(payload)
      };

      lambda.invoke(params, (err, data) => {
        let lambdaResp = {};
        if(err) {

        }
        else {

        }
        lambdaResp.push(lambdaResp);
        
        if(lambdaResps.length === jobsArray.length) {
          cb(lambdaResps);
        }
      });
    }
  }
}

let e = new Earl();