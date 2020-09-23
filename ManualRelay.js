const Relay = require('./relay.js').Relay;

class ManualRelay extends Relay {
  constructor() {
    super("8081");
  }

  invokeLambda() {
    console.log("We are invoking a Lambda!");
  }
}

let manualRelay = new ManualRelay();