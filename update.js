const exec = require('child_process').exec;
const fs = require("fs");
const express = require("express");
const bodyParser = require("body-parser");

class Updater {
  constructor() {
    this.app = express();
    this.AWS = require("aws-sdk");

    this.server = require('http').createServer(this.app);
    this.io =  require('socket.io')(this.server);
    this.cliNamespace = this.io.of("/cli");
    this.relayNamespace = this.io.of("/relay");
    
    this.server.listen("5050", ()  => {
      console.log("App listening on port 5050");
    });

    this.listenSocket();
  }

  listenSocket() {
    this.cliNamespace.on("connect", (socket) => {
      console.log("HEY SOMEONE IS HERE!");
      socket.join("cliRoom");

      socket.on("message", (message) => {
        if(message.type === "update") {
          this.executeScript(message.script);
        }
      });
    });

    this.relayNamespace.on("connect", (socket) => {
      let address = socket.handshake.address;
      socket.join("relayRoom");
      socket.on("message", (message) => {
        if(message.type === "data") {
          this.io.to("cliRoom").emit({type: "data", data: message.data, "source": address});
        }
        else if(message.type === "error") {
          this.io.to("cliRoom").emit({type: "error", error: message.error, "source": address});
        }
      });
    });
  }

  executeScript(script) {
    let scriptFileName = `./update_script_${Date.now()}`;
    console.log("SCRIPT: " + script);

    fs.writeFileSync(scriptFileName, script);
    let scriptProc = exec(`sh ${scriptFileName}`);
    scriptProc.stdout.on("data", (data)=>{
      this.cliNamespace.to("cliRoom").emit("message", {type: "data", data: data});
    });
    scriptProc.stderr.on("data", (data)=>{
      console.error({type: "error", error: data});
      this.cliNamespace.to("cliRoom").emit("message", {type: "data", data: data});
    });
  }
}

let updater = new Updater();