class EC2Launcher {
  constructor() {
    this.amis = {
      "us_east_1": "ami-05c0d7f3fffb419c8",
      "us-east-2": "ami-03c3603751b46f895",
      "us-west-1": "ami-04a823dd6e4f6fd52",
      "us-west-2": "ami-0f7939d313699273c"
    }
  }

  base64_encode(file_path) {
    // read binary data
    var file = fs.readFileSync(file_path);
    // convert binary data to base64 encoded string
    return new Buffer(file).toString('base64');
  }

  createInstance(instanceType, name, region, keyName, instanceCount, userDataPath) {
    var instanceParams = {
      ImageId: this.amis[region], 
      InstanceType: instanceType,
      KeyName: keyName,
      MinCount: instanceCount,
      MaxCount: instanceCount,
      UserData: this.base64_encode(userDataPath)
   };

    // Create a promise on an EC2 service object
    var instancePromise = new AWS.EC2({apiVersion: '2016-11-15'}).runInstances(instanceParams).promise();

    // Handle promise's fulfilled/rejected states
    instancePromise.then(
    function(data) {
      console.log(data);
      var instanceId = data.Instances[0].InstanceId;
      console.log("Created instance", instanceId);
      // Add tags to the instance
      tagParams = {Resources: [instanceId], Tags: [
          {
            Key: 'Name',
            Value: 'SDK Sample'
          }
      ]};
      // Create a promise on an EC2 service object
      var tagPromise = new AWS.EC2({apiVersion: '2016-11-15'}).createTags(tagParams).promise();
      // Handle promise's fulfilled/rejected states
      tagPromise.then(
        function(data) {
          console.log("Instance tagged");
        }).catch(
          function(err) {
          console.error(err, err.stack);
        });
    }).catch(
      function(err) {
      console.error(err, err.stack);
    });


  }
}

// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');
// Load credentials and set region from JSON file
AWS.config.update({region: 'REGION'});

// Create EC2 service object
var ec2 = new AWS.EC2({apiVersion: '2016-11-15'});

// AMI is amzn-ami-2011.09.1.x86_64-ebs
var instanceParams = {
   ImageId: 'AMI_ID', 
   InstanceType: 't2.micro',
   KeyName: 'KEY_PAIR_NAME',
   MinCount: 1,
   MaxCount: 1
};