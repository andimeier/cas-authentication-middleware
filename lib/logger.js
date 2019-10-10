// default logging facility: stdout
let logger = console.log;

// default logging functions
let silly = msg => logger(" ---[CAS] ---> [silly] " + msg);
let debug = msg => logger(" ---[CAS] ---> [debug] " + msg);
let verbose = msg => logger(" ---[CAS] ---> [verbose] " + msg);
let info = msg => logger(" ---[CAS] ---> [info] " + msg);
let warn = msg => logger(" ---[CAS] ---> [warn] " + msg);
let error = msg => logger(" ---[CAS] ---> [error] " + msg);

/**
 * set the logging facility. This must be a function accepting one single parameter:
 * the log message.
 *
 * @param {function} _logger
 */
function setLogger(_logger) {
  if (typeof _logger !== "function") {
    error(
      "[setLogger] illegal logging facility given, should be a function, but is a " +
        typeof _logger
    );
  }
  logger = _logger;
}

module.exports = {
  silly,
  debug,
  verbose,
  info,
  warn,
  error,
  setLogger
};
