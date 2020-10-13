const inquirer = require('inquirer');
inquirer.registerPrompt('suggest', require('inquirer-prompt-suggest'));
const EC2 = require("./ec2_launcher").EC2;
const fs = require("fs");
const h = require('./util.js')._Util; // h for helpers
const LambdaLauncher = require("./LambdaLauncher").LambdaLauncher;

const handle = (promise) => {
  return promise
    .then(data => ([data, null]))
    .catch(error => Promise.resolve([null, error]));
}

class CLIUpdater {
  constructor() {
    this.io = require('socket.io-client');
    this.socket = this.io("http://localhost:5050/cli");

    this.socket.on("message", (message) => {
      if(message.type === "data") {
        console.log(message.data);
      }
      else if(message.type === "error") {
        console.error(message.error);
      }
    });
  }
  
  executeScript(scriptFileName) {
    let script = fs.readFileSync(scriptFileName);
    this.socket.send({type: "update", script: script});
  }
}

//let updater = new CLIUpdater();
//updater.executeScript("./test.sh");

class CLI {
  constructor() {
    this.ec2Util = new EC2();

    this.actions = {
      type: "suggest",
      name: "action",
      message: "Action:",
      suggestions: ["ec2", "lambda"]
    };

    this.ec2 = {
      actions: {
        type: "suggest",
        name: "action",
        message: "EC2:",
        suggestions: ["list", "update", "create"]
      },
      tags: {
        type: "input",
        name: "tags",
        message: "Tags (comma separated):"
      },
      tagType: {
        type: "input",
        name: "tagType",
        message: "Tag category:"
      },
      name: {
        type: "input",
        name: "name",
        message: "Name:"
      },
      types: {
        type: "list",
        name: "type",
        message: "Type:",
        choices: ["t3a.nano", "t3a.micro", "t3a.small", "t3a.medium", "t3a.large", "t3a.xlarge", "t3a.2xlarge", "other"]
      },
      states: {
        type: "list",
        name: "state",
        message: "State:",
        choices: ["pending", "running", "shutting-down", "terminated", "stopping", "stopped"]
      },
      update: {
        type: "input",
        name: "filePath",
        message: "Path:"
      },
      key: {
        type: "input",
        name: "key",
        message: "Key name:"
      }
    }

    this.lambda = {
      actions: {
        type: "suggest",
        name: "action",
        message: "Lambda:",
        suggestions: ["create", "update", "update"]
      },
      memory: {
        type: "number",
        name: "memory",
        message: "RAM (GB):"
      },
      lifetime: {
        type: "number",
        name: "lifetime",
        message: "Timeout (seconds):"
      },
      name: {
        type: "input",
        name: "name",
        message: "Function name:"
      },
      description: {
        type: "input",
        name: "description",
        message: "Function description:"
      },
      bucketName: {
        type: "input",
        name: "name",
        message: "S3 Bucket name:"
      },
      bucketKey: {
        type: "input",
        name: "key",
        message: "S3 Key name:"
      },
      path: {
        type: "input",
        name: "path",
        message: "Code path (absolute):"
      },
      updateType: {
        type: "suggest",
        name: "updateType",
        message: "Update type:",
        suggestions: ["code", "parameters"]
      }
    }
  }

  async mainMenu() {
    let action = await inquirer.prompt(this.actions);
    switch(action.action) {
      case("ec2"):
        await this.ec2Menu();
        await this.mainMenu();
        break;
      case("lambda"):
        await this.lambdaMenu();
        await this.mainMenu();
        break;
    }
  }

  async lambdaMenu() {
    let action = await inquirer.prompt(this.lambda.actions);
    switch(action.action) {
      case("update"):
        await this.lambdaUpdateMenu();
        break;
      case("create"):
        await this.lambdaCreateMenu();
        break;
    }
  }

  async lambdaCreateMenu() {
    console.log("Lambda Create Menu:");
    let name = await inquirer.prompt(this.lambda.name);
    let description = await inquirer.prompt(this.lambda.description);
    let codePath = await inquirer.prompt(this.lambda.path);
    console.log(codePath);
    let bucketName = await inquirer.prompt(this.lambda.bucketName);
    let bucketKey = await inquirer.prompt(this.lambda.bucketKey);
    let memory = await inquirer.prompt(this.lambda.memory);
    let lifetime = await inquirer.prompt(this.lambda.lifetime);

    let launcher = new LambdaLauncher();

    let outzip = "/home/luke/Documents/lazer/lds/testzip.zip";
    let [,zipErr] = await h.attempt(launcher.zipDirectory(codePath.path, outzip));
    if(zipErr) {
      console.error(zipErr);
      return;
    }

    let bucketParams = {
      Bucket: bucketName.name,
      Key: bucketKey.key
    }
    let [uploadResult, uploadErr] = await h.attempt(launcher.uploadFile(outzip, bucketParams, "us-east-1"));
    if(uploadErr) {
      console.error(uploadErr);
      return;
    }
    else {
      console.log(uploadResult);
    }

    let config = {
      FunctionName: name.name, /* required */
      Handler: 'index.handler', /* required */
      Role: 'arn:aws:iam::252108313661:role/LambdaNinja', /* required */
      Runtime: "nodejs12.x",
      Description: description.description,
      MemorySize: memory.memory,
      Publish: true,
      Tags: {},
      Timeout: lifetime.lifetime,
      VpcConfig: {
        SecurityGroupIds: [],
        SubnetIds: []
      }
    };

    console.log(config);

    await launcher.launch(bucketName.name, bucketKey.key, config, "us-east-1");
  }

  async lambdaUpdateMenu() {
    console.log("Lambda Update Menu:");
    let name = await inquirer.prompt(this.lambda.name);
    let action = await inquirer.prompt(this.lambda.updateType);
    if(action.updateType === "parameters") {
      let memory = await inquirer.prompt(this.lambda.memory);
      let lifetime = await inquirer.prompt(this.lambda.lifetime);
      // todo, actually do this
    }
    else if(action.updateType === "code") {
      let codePath = await inquirer.prompt(this.lambda.path);
      let bucketName = await inquirer.prompt(this.lambda.bucketName);
      let bucketKey = await inquirer.prompt(this.lambda.bucketKey);

      let launcher = new LambdaLauncher();

      let outzip = "/home/luke/Documents/lazer/lds/testzip.zip";
      let [,zipErr] = await h.attempt(launcher.zipDirectory(codePath.path, outzip));
      if(zipErr) {
        console.error(zipErr);
        return;
      }

      let bucketParams = {
        Bucket: bucketName.name,
        Key: bucketKey.key
      }
      let [uploadResult, uploadErr] = await h.attempt(launcher.uploadFile(outzip, bucketParams, "us-east-1"));
      if(uploadErr) {
        console.error(uploadErr);
        return;
      }
      else {
        console.log(uploadResult);
      }
      await launcher.updateCode(bucketName.name, bucketKey.key, name.name, "us-east-1");
    }
  }

  async ec2Menu() {
    let action = await inquirer.prompt(this.ec2.actions);
    switch(action.action) {
      case("list"):
        await this.ec2DescribeMenu();
        break;
      case("update"):
        await this.ec2UpdateMenu();
        break;
      case("create"):
        await this.ec2CreateMenu();
        break;
    }
  }

  async ec2DescribeMenu() {
    let tagType = await inquirer.prompt(this.ec2.tagType);
    let tagsString = await inquirer.prompt(this.ec2.tags);
    //let instanceType = await inquirer.prompt(this.ec2.types);
    let instanceState = await inquirer.prompt(this.ec2.states);
    //console.log(this.ec2);
    let instances = await this.ec2Util.describeInstances([
      {
        Name: `tag:${tagType.tagType}`,
        Values: tagsString.tags.split(",")
      },
      {
        Name: 'instance-state-name',
        Values: [instanceState.state]
      },
      /*{
        Name: `instance-type`,
        Values: [instanceType.type]
      }*/
    ]);
    for(let i = 0; i < instances.Reservations.length; i++) {
      for(let j = 0; j < instances.Reservations[i].Instances.length; j++) {
        let instance = instances.Reservations[i].Instances[j];
        console.log(`Type: ${instance.InstanceType}`);
        console.log(`Private IP: ${instance.PrivateIpAddress}`);
        console.log(`Public URL: ${instance.PublicDnsName || 'None'}`);
        console.log("\n");
      }
    }
  }

  async ec2CreateMenu() {
    console.log("Coordinator Configuration:");
    let coordinatorType = await inquirer.prompt(this.ec2.types);
    console.log(coordinatorType);
    if(coordinatorType.type === "other") {
      console.log("Enter the instance type:");
      coordinatorType = await inquirer.prompt({
        type: "input",
        name: "type",
        message: "Type:"
      });
    }
    let blockStorageSize = await inquirer.prompt({
      type: "number",
      name: "gb",
      message: "Size (GB):",
      default: 100
    });
    let coordinatorLaunchScriptPath = await inquirer.prompt({
      type: "input",
      name: "path",
      message: "Launch Script Path:",
      default: "./ec2_dist_config.sh"
    });

    console.log("Relay Configuration:");
    let relayType = await inquirer.prompt(this.ec2.types);
    console.log(coordinatorType);
    if(coordinatorType.type === "other") {
      console.log("Enter the instance type:");
      coordinatorType = await inquirer.prompt({
        type: "input",
        name: "type",
        message: "Type:"
      });
    }
    let relayLaunchScriptPath = await inquirer.prompt({
      type: "input",
      name: "path",
      message: "Launch Script Path:"
    });
    let relayCount = await inquirer.prompt({
      type: "number",
      name: "count",
      message: "Node Count:",
      default: 10
    });

    let keyName = await inquirer.prompt(this.ec2.key);
    let namespace = await inquirer.prompt({
      type: "input",
      name: "namespace",
      message: "Namespace"
    });

    let coordinatorConfig = {
      InstanceType: coordinatorType.type,
      KeyName: keyName.key,
      SecurityGroupIds: [
        "sg-001e53a36d06474db"
      ],
      TagSpecifications: [{
        ResourceType: "instance", 
        Tags: [{
          Key: "Name", 
          Value: `${namespace.namespace}-coordinator`
        }
      ]}]
    };
    let [coordinator, coordErr] = await h.attempt(this.ec2Util.createInstance(coordinatorConfig, 
      coordinatorLaunchScriptPath.path,
      1,
      "us-east-1"));
    if(coordErr) {
      console.error(coordErr);
      return;
    }
    else {
      console.log(coordinator);
      let id = coordinator.Instances[0].InstanceId;
      console.log("Created instance: " + id);
    }

    let relaysConfig = {
      InstanceType: relayType.type,
      KeyName: keyName.key,
      SecurityGroupIds: [
        "sg-001e53a36d06474db"
      ],
      TagSpecifications: [{
        ResourceType: "instance", 
        Tags: [{
          Key: "Name", 
          Value: `${namespace.namespace}-relay`
        }
      ]}]
    }
    let [relays, relayErr] = await h.attempt(this.ec2Util.createInstance(relaysConfig, 
      relayLaunchScriptPath.path,
      relayCount.count,
      "us-east-1"));
    if(relayErr) {
      console.error(relayErr);
    }
    else {
      console.log("Launching relay instances...");
      for(let i = 0; i < relays.Instances.length; i++) {
        console.log(`${relays.Instances[i].InstanceId}: ${relays.Instances[i].PrivateIpAddress}`);
      }
    }
  }

  async ec2UpdateMenu() {
    let scriptPath = await inquirer.prompt(this.ec2.update);
  }
}

let cli = new CLI();
cli.mainMenu();