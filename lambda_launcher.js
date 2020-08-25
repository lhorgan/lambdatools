//const exec = util.promisify(require('child_process').exec);

const { exec } = require("child_process");
const { stderr } = require("process");

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

  createBucket(bucketName) {

  }

  uploadFile(path) {

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