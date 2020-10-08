const AWS = require('aws-sdk');

const { exec, execSync } = require("child_process");
const { stderr } = require("process");
const util = require('util');
const fs = require('fs');
const h = require('./util.js')._Util; // h for helpers
const path = require("path");

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

    let outzip = "/home/luke/Documents/lazer/lds/testzip.zip";
    let [, zipErr] = await handle(this.zipDirectory("/home/luke/Documents/lambdathingie", outzip));
    if(zipErr) {
      console.error(zipErr);
      return;
    }
    console.log("Success... moving to upload");

    /*let [bucketCreateRes, bucketCreateErr] = await h.attempt(this.createBucket({
      Bucket: "lambda-bucket-917"
    }, "us-east-1"));

    if(bucketCreateErr) {
      console.error(bucketCreateErr);
    }
    else {
      console.log(bucketCreateRes);
    }*/

    let bucketParams = {
      Bucket: "lambda-bucket-917",
      Key: "functionCode"
    }
    let [uploadResult, uploadErr] = await h.attempt(this.uploadFile(outzip, bucketParams, "us-east-1"));
    if(uploadErr) {
      console.error(uploadErr);
      return;
    }
    else {
      console.log(uploadResult);
    }
    
    let config = {
      Code: { /* required */
        S3Bucket: 'lambda-bucket-917',
        S3Key: 'functionCode',
      },
      FunctionName: 'TestFunc121', /* required */
      Handler: 'index.handler', /* required */
      Role: 'arn:aws:iam::252108313661:role/LambdaNinja', /* required */
      Runtime: "nodejs12.x",
      Description: 'A description',
      MemorySize: '256',
      Publish: true,
      Tags: {
        'Name': "GRKFUNCTION"
      },
      Timeout: 120,
      VpcConfig: {
        /*SecurityGroupIds: [
          'sg-001e53a36d06474db',
        ],
        SubnetIds: [
          'subnet-16e1034e',
          'subnet-d40a64b1',
          'subnet-92d8c4b9',
          'subnet-26448c50',
          'subnet-bf58dc82',
          'subnet-1761eb1b'
        ]*/
      }
    };

    //await this.launch("lambda-bucket-917", "functionCode", config, "us-east-1");
    await this.updateCode("lambda-bucket-917", "functionCode", "TestFunc121", "us-east-1")
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

  uploadFile(zipPath, bucketParams, region) {
    return new Promise((resolve, reject) => {
      //var fileData = Buffer.from(path, "binary");
      console.log("reading in " + zipPath);
      var fileStream = fs.createReadStream(zipPath);
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
            console.log("Failed to launch.");
            reject(err);
          }
          else {
            console.log("Launched");
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

      lambda.updateFunctionCode(params, (err, data) => {
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
    //let realPath = execSync(`realpath ${output}`);

    console.log("Zipping to " + output);

    return new Promise((resolve, reject) => {
      exec(`cd ${input_path}; zip -r ${output} .`, (error, stdout, stderr) => {
        if(error) {
          reject(error);
        }
        else {
          console.log("Zipped successfully!");
          console.log(stdout);
          resolve();
        }
      });
    });
  }
}

//l = new LambdaLauncher();
//l.go();
module.exports.LambdaLauncher = LambdaLauncher;