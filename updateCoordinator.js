const fs = require("fs");
const express = require("express");

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
    
    this.server.listen(this.port, ()  => {
      console.log(`App listening on port ${this.port}`);
    });

    this.listenSocket();
  }

  listenSocket() {
    this.relayIO.on("connect", (socket) => {
      console.log("Coordinator connected");
      if(this.coordinatorSocket) {
        console.log("Appears the coordinator reconnected...");
        this.coordinatorSocket.disconnect();
      }
      this.coordinatorSocket = socket;
    });
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

  connectToRelays() {
    /*let relayURLs = this.getRelayURLs();

    for(let i = 0; i < instances.Reservations.length; i++) {
      for(let j = 0; j < instances.Reservations[i].Instances.length; j++) {
        let instance = instances.Reservations[i].Instances[j];
        this.addRelaySocket(`http://${instance.PrivateIpAddress}:${this.relayPort}`);
      }
    }*/
  }

  addRelaySocket(socket) {
    
  }

  /*listenSocket() {
    this.relayNamespace.on("connect", (socket) => {
      console.log("Someone joined!");
      let address = socket.handshake.address;
      socket.join("relayRoom");
      socket.on("message", (message) => {
        console.log(message);
      });
    });
  }*/
}

let updater = new Updater({
  relayNamespace: "whylord",
  relayPort: "4101",
  port: "5101"
});