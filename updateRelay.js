const fs = require("fs");
const { exec, execSync } = require("child_process");

class Updater {
  constructor(port) {
    let express = require("express");

    this.io = require('socket.io-client');
    this.app = express();
    this.server = require('http').createServer(this.app);
    const bodyParser = require("body-parser");

    this.listenHTTP();
  }

  listenSocket() {
    this.socket = this.io(`${this.coordURL}/relay`, {query: {}});
    socket.on("message", (message) => {
      if(message.type === "update") {
        this.executeScript(message.script);
      }
    });
  }

  listenHTTP() {
    // Listen on the port specified in console args
    this.app.listen(this.port, ()  => {
      console.log("App is listening on port " + this.port);
    });
    
    this.app.post("/coordinator", (req, res) => {
      this.coordURL = req.body;
    });
  }
  
  executeScript(script) {
    let scriptFileName = `./update_script_${Date.now()}`;
    console.log("SCRIPT: " + script);

    fs.writeFileSync(scriptFileName, script);
    let scriptProc = exec(`sh ${scriptFileName}`);
    scriptProc.stdout.on("data", (data)=>{
      console.log(data);
      this.socket.send({type: "data", data: data});
    });
    scriptProc.stderr.on("data", (data)=>{
      console.error({type: "error", error: data});
      this.socket.send({type: "data", data: data});
    });
    scriptProc.stderr.on("end", (data) => {
      this.socket.send({type: "end"});
      this.socket.close();
    });
  }
}

let updater = new Updater("8000");