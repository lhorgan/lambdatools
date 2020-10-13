const fs = require("fs");
const express = require("express");
const h = require('./util.js')._Util; // h for helpers
const EC2 = require("./ec2_launcher").EC2;
const fetch = require('node-fetch');
const execSync = require('child_process').execSync;

class Updater {
  constructor(config) {
    this.app = express();
    this.AWS = require("aws-sdk");

    this.server = require('http').createServer(this.app);
    this.io =  require('socket.io')(this.server);

    this.io =  require('socket.io')(this.server);
    this.coordinatorNamespace = this.io.of("/coordinator");
    this.lambdaNamespace = this.io.of("/lambda");
    
    this.relayNamespace = config.relayNamespace;
    this.relayPort = config.relayPort;
    this.relayIO = this.io.of("/relay");

    this.port = config.port;
    this.scriptFileName = "./ec2_dist_config.sh";

    this.ec2Util = new EC2();

    this.setup();
    this.relaysCompleteCount = 0;

    this.server.listen(this.port, ()  => {
      console.log(`App listening on port ${this.port}`);
    });

    this.listenSocket();
  }

  setup() {
    let d = new Date();
    this.outputDir = `./${d.getDay()}_${d.getMonth()}_${d.getFullYear()}_${d.getHours()}_${d.getMinutes()}_${d.getSeconds()}`;
    this.script = fs.readFileSync(this.scriptFileName);

    if(!fs.existsSync(this.outputDir)){
      fs.mkdirSync(this.outputDir);
    }
  }

  listenSocket() {
    this.relayIO.on("connect", (socket) => {
      socket.join("relayRoom");

      socket.on("disconnect", () => {
        console.log("Socket disconnecting from room.");
        socket.leave("relayRoom");
      });

      socket.send({type: "update", script: this.script});
      let socketFilename = this.outputDir + "/" + socket.id + ".log";

      socket.on("message", (message) => {
        console.log("HERE IS THE MESSAGE");
        console.log(message);
        if(message.type === "data" || message.type === "error") {
          fs.appendFile(socketFilename, `${message.type}: ${message.data}`, () => {});
        }
        else if(message.type === "end") {
          this.relaysCompleteCount++;
          console.log("Relay finished...");
          if(this.relaysCompleteCount >= this.relayURLs.length) {
            console.log("Closing the server....")
            this.server.close();
          }
        }
      });
    });

    this.go();
  }

  async go() {
    this.relayURLs = await this.getRelayURLs();
    console.log(this.relayURLs);
    this.connectToRelays(this.relayURLs);
  }

  async getRelayURLs() {
    let relayURLs = [];

    let [instances, err] = await h.attempt(this.ec2Util.describeInstances([
      {
        Name: `tag:Name`,
        Values: [`${this.relayNamespace}-relay*`]
      },
      {
        Name: 'instance-state-name',
        Values: ["running"]
      },
    ]));

    if(err) {
      console.error("Could not load relays.  Aborting.");
      return [];
    }

    for(let i = 0; i < instances.Reservations.length; i++) {
      for(let j = 0; j < instances.Reservations[i].Instances.length; j++) {
        let instance = instances.Reservations[i].Instances[j];
        relayURLs.push(`http://${instance.PrivateIpAddress}:${this.relayPort}`);
      }
    }

    return relayURLs;
  }

  connectToRelays(relayURLs) {
    let myIP = execSync("ec2metadata --local-ipv4").toString().trim();
    let body = {"coordURL": `http://${myIP}:${this.port}`};
    //console.log("THE BODY");
    //console.log(JSON.stringify(body));

    for(let i = 0; i < relayURLs.length; i++) {
      console.log("Attempting to connect to " + relayURLs[i]);
      fetch(relayURLs[i] + "/relay", {
        method: "post",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json"
        }
      })
      .then(data => {
        console.log("Connected");
        //console.log(data);
      })
      .catch(err => {
        console.error(err);
      })
    }
  }
}

let updater = new Updater({
  relayNamespace: "rowboats",
  relayPort: "5051",
  port: "5050"
});