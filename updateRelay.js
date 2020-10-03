class Updater {
  constructor(relayPort) {
    let express = require("express");

    this.io = require('socket.io-client');
    this.server = require('http').createServer(this.app);
    this.app = express();

    this.relayPort = relayPort;

    this.listenHTTP();

    // this.socket = this.io(`${coordURL}/relay`, {query: {}});
    // this.socket.on("message", (message) => {
    //   if(message.type === "update") {
    //     this.executeScript(message.script);
    //   }
    // });
  }

  listenHTTP() {
    // Listen on the port specified in console args
    this.server.listen(this.port, ()  => {
      console.log("App listening on port " + this.relayPort);
    });
    
    this.app.post("/relay", (req, res) => {
      this.coordAddress = req.body;
    });
  }
  
  executeScript(script) {
    let scriptFileName = `./update_script_${Date.now()}`;
    console.log("SCRIPT: " + script);

    fs.writeFileSync(scriptFileName, script);
    let scriptProc = exec(`sh ${scriptFileName}`);
    scriptProc.stdout.on("data", (data)=>{
      this.cliNamespace.send("message", {type: "data", data: data});
    });
    scriptProc.stderr.on("data", (data)=>{
      console.error({type: "error", error: data});
      this.cliNamespace.send("message", {type: "data", data: data});
    });
  }
}

let updater = new Updater("5031");