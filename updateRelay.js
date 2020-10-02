class Updater {
  constructor() {
    this.io = require('socket.io-client');

    this.listenHTTP();

    this.socket = this.io(`${coordURL}/relay`, {query: {}});
    socket.on("message", (message) => {
      if(message.type === "update") {
        this.executeScript(message.script);
      }
    });
  }

  listenHTTP() {
    // Listen on the port specified in console args
    this.server.listen(this.port, ()  => {
      console.log("App listening on port " + this.relayPort);
    });
    
    this.app.post("/coordinator", (req, res) => {
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

let updater = new Updater();