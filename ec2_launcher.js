// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');
const fs = require("fs");
// Load credentials and set region from JSON file

// Create EC2 service object
//var ec2 = new AWS.EC2({apiVersion: '2016-11-15'});

class EC2Launcher {
  constructor() {
    // https://wiki.debian.org/Cloud/AmazonEC2Image/Buster
    // US-based 
    this.amis = {
      "us-east-1": "ami-05c0d7f3fffb419c8",
      "us-east-2": "ami-03c3603751b46f895",
      "us-west-1": "ami-04a823dd6e4f6fd52",
      "us-west-2": "ami-0f7939d313699273c"
    }
  }

  go() { // for testing
    this.createInstance("t2.micro", "testingFromNode", "us-east-1", "h6", 1, "./ec2_dist_config.sh");
    //this.getKeys("us-east-1");
  }

  base64_encode(file_path) {
    // read binary data
    var file = fs.readFileSync(file_path).toString();
    //console.log(file);
    
    // convert binary data to base64 encoded string
    let b64 = new Buffer.from(file).toString('base64');
    //console.log(b64);
    return b64;
  }

  getKeys(region) {
    AWS.config.update({region: region});
    let ec2 = new AWS.EC2({apiVersion: '2016-11-15'});

    return new Promise((accept, reject) => {
      ec2.describeKeyPairs({}, (err, data) => {
        if(err) {
          reject(err);
        }
        else {
          accept(data);
        }
      });
    });
  }

  makeKeys(name, region) {
    AWS.config.update({region: region});

    var params = {
      KeyName: name
    };

    return new Promise((accept, reject) => {
      ec2.createKeyPair(params, (err, data) => {
        if(err) {
          reject(err);
        }
        else {
          accept(data);
        }
      });
    });
  }

  describeInstances(filters) {
    AWS.config.update({region: "us-east-1"});
    let ec2 = new AWS.EC2({apiVersion: '2016-11-15'})

    return new Promise((accept, reject) => {
      ec2.describeInstances({Filters: filters}, function(err, data) {
        if (err) {
          console.log(err, err.stack); // an error occurred
          reject(err);
        }
        else {
          accept(data);
        }
      });
    });
  }

  createInstance(config, setupScriptPath, instanceCount, region) {
    config.MinCount = instanceCount;
    config.MaxCount = instanceCount;
    config.ImageId = this.amis[region];
    config.UserData = this.base64_encode(setupScriptPath);
    
    AWS.config.update({region: region});
    let ec2 = new AWS.EC2({apiVersion: '2016-11-15'});

    return new Promise((accept, reject) => {
      ec2.runInstances(config, (err, data) => {
        if(err) {
          reject(err);
        }
        else {
          accept(data);
        }
      });
    });
  }

  addTags(instanceIds, tags, region) {
    if(!Array.isArray(instanceIds)) {
      instanceIds = [instanceIds];
    }

    AWS.config.update({region: region});
    let ec2 = new AWS.EC2({apiVersion: '2016-11-15'});

    let tagsList = [];
    for(let tag in tags) {
      tagsList.push({Name: tag, Value: tags[tag]});
    }

    return new Promise((accept, reject) => {
      ec2.createTags({Resources: instanceIds, Tags: tagsList}, (err, data) => {
        if(err) {
          reject(err);
        }
        else {
          accept(data);
        }
      });
    });
  }
}

exports.EC2 = EC2Launcher;