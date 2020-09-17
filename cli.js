const inquirer = require('inquirer');
inquirer.registerPrompt('suggest', require('inquirer-prompt-suggest'));
const EC2 = require("./ec2_launcher").EC2;
const fs = require("fs");
const h = require('./util.js')._Util; // h for helpers

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
  }

  async mainMenu() {
    let action = await inquirer.prompt(this.actions);
    switch(action.action) {
      case("ec2"):
        await this.ec2Menu();
        await this.mainMenu();
        break;
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
      KeyName: keyName.key
    };
    let [coordinator, coordErr] = await h.handle(this.ec2Util.createInstance(coordinatorConfig, 
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
      KeyName: keyName.key
    }
    let [relays, relayErr] = await h.handle(this.ec2Util.createInstance(relaysConfig, 
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
cli.ec2CreateMenu();