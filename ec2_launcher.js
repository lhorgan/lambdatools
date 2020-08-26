// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');
const fs = require("fs");
// Load credentials and set region from JSON file

// Create EC2 service object
var ec2 = new AWS.EC2({apiVersion: '2016-11-15'});

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
    console.log(file);
    
    // convert binary data to base64 encoded string
    let b64 = new Buffer.from(file).toString('base64');
    console.log(b64);
    return b64;
  }

  getKeys(region) {
    AWS.config.update({region: region});
    let ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
    ec2.describeKeyPairs({}, (err, data) => {
      if(err) {
        console.error(err);
      }
      else {
        console.log(data);
      }
    });
  }  

  createInstance(instanceType, name, region, keyName, instanceCount, userDataPath) {
    AWS.config.update({region: region});

    var instanceParams = {
      ImageId: this.amis[region], 
      InstanceType: instanceType,
      KeyName: keyName,
      MinCount: instanceCount,
      MaxCount: instanceCount,
      UserData: this.base64_encode(userDataPath)
   };
   console.log(instanceParams);

    // Create a promise on an EC2 service object
    var instancePromise = new AWS.EC2({apiVersion: '2016-11-15'}).runInstances(instanceParams).promise();

    // Handle promise's fulfilled/rejected states
    instancePromise.then(
    function(data) {
      console.log(data);
      var instanceId = data.Instances[0].InstanceId;
      console.log("Created instance", instanceId);
      // Add tags to the instance
      // tagParams = {Resources: [instanceId], Tags: [
      //     {
      //       Key: 'Name',
      //       Value: 'SDK Sample'
      //     }
      // ]};
      // Create a promise on an EC2 service object
      // var tagPromise = new AWS.EC2({apiVersion: '2016-11-15'}).createTags(tagParams).promise();
      // Handle promise's fulfilled/rejected states
      // tagPromise.then(
      //   function(data) {
      //     console.log("Instance tagged");
      //   }).catch(
      //     function(err) {
      //     console.error(err, err.stack);
      //   });
    }).catch(
      function(err) {
      console.error(err, err.stack);
    });
  }
}

launcher = new EC2Launcher();
launcher.go();