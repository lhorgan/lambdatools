const AWS = require('aws-sdk');

const { exec } = require("child_process");
const { stderr } = require("process");
const util = require('util');
const fs = require('fs');

// clever pattern from https://dev.to/sobiodarlington/better-error-handling-with-async-await-2e5m
const handle = (promise) => {
  return promise
    .then(data => ([data, null]))
    .catch(error => Promise.resolve([null, error]));
}

class LambdaLauncher {
  constructor() {
  }

  async go() {
    // let [result, error] = await handle(this.zipDirectory("./testzip", "testzip.zip"));
    // if(error) {
    //   console.error(error);
    // }
    // else {
    //   console.log("Success!");
    // }

    let res = await this.listFunctionsHelper("us-east-1", {});
    console.log(res);
  }

  createBucket(bucketParams) {
    return new Promise((resolve, reject) => {
      s3.createBucket(bucketParams, function(err, data) {
        if(err) {
          reject(err);
        }
        else {
          resolve(data);
        }
      });
    });
  }

  uploadFile(path, bucketParams) {
    return new Promise((resolve, reject) => {
      //var fileData = Buffer.from(path, "binary");
      var fileStream = fs.createReadStream(path);
      fileStream.on('error', function(err) {
        console.error('File Error', err);
      });
      bucketParams.Body = fileStream;

      s3.upload(bucketParams, function(err, data) {
        if(err) {
          reject(err);
        }
        else {
          resolve(data);
        }
      });
    });
  }

  launch(region, S3BucketName, S3KeyName, config) {
    console.log("Attempting to launch " + name);
    AWS.config.update({region: region});
    let lambda = new AWS.Lambda();

    var params = {
      Code: {
          //ZipFile: fs.readFileSync("lambda.zip")
          S3Bucket: S3BucketName,
          S3Key: S3KeyName
      }
    };
    for(let fieldName in config) {
      params[fieldName] = config[fieldName];
    }

    lambda.createFunction(params, (err, data) => {
        if(err) {
            console.log(err);
            console.log("Failed to launch " + name);
        }
        else {
            console.log("Launched " + name);
        }
    });
  }

  async iterateFunction(f, milliseconds, count) {
    return new Promise((accept, reject) => {
      let i = 0;    
      let interval = setInterval(async () => {
        let [data, error] = await handle(f());
        i++;
        if(i === count) {
          clearInterval(interval);
          accept(data)
        }

        if(error) {
          clearInterval(interval);
          reject(error);
        }
      }, milliseconds);
    });
  }

  async listFunctions(namespace, region) {
    let nextMarker = null;

    do {
      let [functionData, error] = await handle(this.listFunctionsHelper(region, params));
      if(error) { // reject the promise
        throw new Error(error);
      }
      nextMarker = functionData.nextToken;
    } while(nextMarker !== null);

    return true;
  }

  async listFunctionsHelper(region, params) {
    AWS.config.update({region: region});
    let lambda = new AWS.Lambda();

    return new Promise((accept, reject) => {
      lambda.listFunctions(params, (err, data) => {
        if(err) {
          console.error(err, err.stack);
          reject(err);
        }
        else {
          let lambdas = data.Functions;
          let lambdaNames = [];

          for(let i = 0; i < lambdas.length; i++) {
            lambdaNames.push(lambdas[i].FunctionName);
          }

          let nextMarker = data.NextMarker;
          accept({lambdaNames, nextMarker});
        }
      });
    });
  }

  async zipDirectory(input_path, output) {
    return new Promise((resolve, reject) => {
      exec(`zip -r ${output} ${input_path}`, (error, stdout, stderr) => {
        if(error) {
          reject(error);
        }
        else {
          resolve();
        }
      });
    });
  }
}

l = new LambdaLauncher();
l.go();
