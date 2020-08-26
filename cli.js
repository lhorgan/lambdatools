const readline = require("readline");

class CLI {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // [prompt, key]
    this.prompts = [];
  }

  setPrompts(prompts) {
    this.prompts = prompts;
  }
}