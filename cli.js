const inquirer = require('inquirer');
inquirer.registerPrompt('suggest', require('inquirer-prompt-suggest'));
const EC2 = require("./ec2_launcher").EC2;
const fs = require("fs");

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

let updater = new CLIUpdater();
updater.executeScript("./test.sh")

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
        choices: ["t3.nano", "t3.micro", "t3.small", "t3.medium", "t3.large", "t3.xlarge", "t3.2xlarge"]
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
    
  }

  async ec2UpdateMenu() {
    let scriptPath = await inquirer.prompt(this.ec2.update);
  }
}

//let cli = new CLI();
//cli.mainMenu();