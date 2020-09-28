const AWS = require('aws-sdk');

const { exec } = require("child_process");
const { stderr } = require("process");
const util = require('util');
const fs = require('fs');
const h = require('./util.js')._Util; // h for helpers

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

    // let res = await this.listFunctions("hi", "eu-west-1");
    // console.log(res);

    let [, zipErr] = await handle(this.zipDirectory("./testzip", "testzip.zip"));
    if(zipErr) {
      console.error(zipErr);
      return;
    }

    /*let [bucketCreateRes, bucketCreateErr] = await h.attempt(this.createBucket({
      Bucket: "lambda-bucket-917"
    }, "us-east-1"));

    if(bucketCreateErr) {
      console.error(bucketCreateErr);
    }
    else {
      console.log(bucketCreateRes);
    }*/

    /*let bucketParams = {
      Bucket: "lambda-bucket-917",
      Key: "functionCode"
    }
    let [uploadResult, uploadErr] = await h.attempt(this.uploadFile("./testzip.zip", bucketParams, "us-east-1"));
    if(uploadErr) {
      console.error(uploadErr);
      return;
    }
    else {
      console.log(uploadResult);
    }*/

    
  }

  createBucket(bucketParams, region) {
    AWS.config.update({region: region});
    let s3 = new AWS.S3();

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

  uploadFile(path, bucketParams, region) {
    return new Promise((resolve, reject) => {
      //var fileData = Buffer.from(path, "binary");
      var fileStream = fs.createReadStream(path);
      fileStream.on('error', function(err) {
        console.error('File Error', err);
      });
      bucketParams.Body = fileStream;

      AWS.config.update({region: region});
      let s3 = new AWS.S3();
      
      s3.upload(bucketParams, (err, data) => {
        if(err) {
          reject(err);
        }
        else {
          resolve(data);
        }
      });
    });
  }

  launch(S3BucketName, S3KeyName, config, region) {
    return new Promise((accept, reject) => {
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
            reject(err);
          }
          else {
            console.log("Launched " + name);
            accept(data);
          }
      });
    });
  }

  updateCode(S3BucketName, S3KeyName, functionName, region) {
    return new Promise((accept, reject) => {
      AWS.config.update({region: region});
      let lambda = new AWS.Lambda();
      
      var params = {
        S3Bucket: S3BucketName,
        S3Key: S3KeyName,
        FunctionName: functionName
      };

      lambda.updateCode(params, (err, data) => {
          if(err) {
            console.log(err);
            console.log("Failed to update " + functionName);
            reject(err);
          }
          else {
            console.log("Updated " + functionName);
            accept(data);
          }
      });
    });
  }

  updateConfig(S3BucketName, S3KeyName, functionName, config, region) {
    return new Promise((accept, reject) => {
      AWS.config.update({region: region});
      let lambda = new AWS.Lambda();
      
      var params = {
        S3Bucket: S3BucketName,
        S3Key: S3KeyName,
        FunctionName: functionName
      };
      for(let fieldName in config) {
        params[fieldName] = config[fieldName];
      }

      lambda.updateFunctionConfiguration(params, (err, data) => {
          if(err) {
            console.log(err);
            console.log("Failed to update " + functionName);
            reject(err);
          }
          else {
            console.log("Updated " + functionName);
            accept(data);
          }
      });
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
    let params = {};
    let lambdaNames = [];

    do {
      let [functionData, error] = await handle(this.listFunctionsHelper(region, params));
      lambdaNames = lambdaNames.concat(functionData.lambdaNames);
      if(error) { // reject the promise
        throw new Error(error);
      }
      nextMarker = functionData.nextMarker;
      params.Marker = nextMarker;
    } while(nextMarker !== null);

    return lambdaNames;
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

          let nextMarker = this.nullify(data.NextMarker);
          accept({lambdaNames, nextMarker});
        }
      });
    });
  }

  nullify(result) {
    if(!result) {
      return null;
    }
    return result;
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
