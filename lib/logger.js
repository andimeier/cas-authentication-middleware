const logger = {
  silly: msg => console.log(" ---[CAS] ---> [silly] " + msg),
  debug: msg => console.log(" ---[CAS] ---> [debug] " + msg),
  verbose: msg => console.log(" ---[CAS] ---> [verbose] " + msg),
  info: msg => console.log(" ---[CAS] ---> [info] " + msg),
  warn: msg => console.log(" ---[CAS] ---> [warn] " + msg),
  error: msg => console.log(" ---[CAS] ---> [error] " + msg)
};

module.exports = logger;
