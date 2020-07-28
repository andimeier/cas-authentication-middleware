// default logging facility: stdout
let logger = console.log;

// default logging functions
let silly = msg => log("silly", msg);
let debug = msg => log("debug", msg);
let verbose = msg => log("verbose", msg);
let info = msg => log("info", msg);
let warn = msg => log("warn", msg);
let error = msg => log("error", msg);

function log(level, msg) {
  if (typeof logger[level] === "function") {
    logger[level](" --- [CAS] ---> " + msg);
  } else {
    logger(` --- [CAS] ---> [${level}] ${msg}`);
  }
}

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
  } else {
    logger = _logger;
  }
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
