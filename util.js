class Util {
  constructor() {}

  static attempt(promise) {
    return promise
      .then(data => [data, null])
      .catch(error => Promise.resolve([null, error]));
  }

  static async redisSetAdd(client, namespace, key, value) {
    return new Promise((accept, reject) => {
      if(typeof(value) === "object") {
        value - JSON.stringify(value);
      }
      client.sadd(`${namespace}_${key}`, value, (err, res) => {
        if(err) {
          reject(err);
        }
        else {
          accept(res);
        }
      });
    });
  }

  static async redisSetRem(client, namespace, key, value) {
    return new Promise((accept, reject) => {
      client.srem(`${namespace}_${key}`, value, (err, res) => {
        if(err) {
          reject(err);
        }
        else {
          accept(res);
        }
      });
    });
  }

  static async redisSetPop(client, namespace, key) {
    return new Promise((accept, reject) => {
      client.spop(`${namespace}_${key}`, (err, res) => {
        if(err) {
          reject(err);
        }
        else {
          accept(res);
        }
      });
    });
  }

  static async redisSet(client, namespace, key, value) {
    return new Promise((accept, reject) => {
      if(typeof(value) === "object") {
        value = JSON.stringify(value);
      }
      client.set(`${namespace}_${key}`, value, (err, res) => {
        if(err) {
          reject(err);
        }
        else {
          accept(res);
        }
      });
    });
  }

  static async redisGet(client, namespace, key) {
    return new Promise((accept, reject) => {
      client.get(`${namespace}_${key}`, (err, res) => {
        if(err) {
          reject(err);
        }
        else {
          accept(res);
        }
      });
    });
  }

  static async redisDel(client, namespace, key) {
    return new Promise((accept, reject) => {
      client.del(`${namespace}_${key}`, (err, res) => {
        if(err) {
          reject(err);
        }
        else {
          accept(res);
        }
      });
    });
  }

  static async redisLPush(client, namespace, key, value) {
    return new Promise((accept, reject) => {
      if(typeof(value) === "object") {
        value = JSON.stringify(value);
      }
      client.lpush(`${namespace}_${key}`, value, (err, res) => {
        if(err) {
          reject(err);
        }
        else {
          accept(res);
        }
      });
    });
  }

  static async redisLLen(client, namespace, key) {
    return new Promise((accept, reject) => {
      client.llen(`${namespace}_${key}`, (err, res) => {
        if(err) {
          reject(err);
        }
        else {
          accept(res);
        }
      });
    });
  }

  static async redisLPop(client, namespace, key) {
    return new Promise((accept, reject) => {
      client.lpop(`${namespace}_${key}`, (err, res) => {
        if(err) {
          console.log("something went wrong, rejecting");
          reject(err);
        }
        else {
          try {
            res = JSON.parse(res);
          }
          catch {}
          console.log("All good, accepting");
          accept(res);
        }
      })
    });
  }

  static async redisLen(client, namespace, key) {
    return new Promise((accept, reject) => {
      client.llen(`${namespace}_${key}`, (err, res) => {
        if(err) {
          reject(err);
        }
        else {
          accept(res);
        }
      });
    });
  }
}

exports._Util = Util;