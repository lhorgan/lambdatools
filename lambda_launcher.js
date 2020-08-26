//const exec = util.promisify(require('child_process').exec);

const { exec } = require("child_process");
const { stderr } = require("process");
const util = require('util');
const fs = require('fs');

// clever pattern from https://dev.to/sobiodarlington/better-error-handling-with-async-await-2e5m
const handle = (promise) => {
  return promise
    .then(data => ([data, undefined]))
    .catch(error => Promise.resolve([undefined, error]));
}

class LambdaLauncher {
  constructor() {
  }

  async go() {
    let [result, error] = await handle(this.zipDirectory("./testzip", "testzip.zip"));
    if(error) {
      console.error(error);
    }
    else {
      console.log("Success!");
    }
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