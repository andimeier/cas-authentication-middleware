const CASAuthentication = require("./lib/cas-authentication");
const url = require("url");
const _ = require("lodash");
const casRouter = require("./lib/cas-router.js");
var parseXML = require("xml2js").parseString;
var XMLprocessors = require("xml2js/lib/processors");
const casHelpers = require("./lib/cas-helper-functions");

// name of session property holding the user ID
const session_userId = "userId";

const casRouterPrefix = "cas";

/**
 * initialisation functions
 *
 * @return {object} the module itself (for fluid interface syntax like const cas = require('cas-authentication-middleware').init(...))
 */
function init(_options) {
  options = casHelpers.registerOptions(_options);

  casHelpers.periodicRemoveExpiredTickets(options.expiredSessionsCheckInterval);

  casHelpers.init();
  return module.exports;
}

/**
 * CAS handler
 *
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
function casHandler(req, res, next) {
  if (req.session && req.session[session_userId]) {
    console.log(
      `---[CAS]---> session available (userId: ${
        req.session[session_userId]
      }) => no CAS cycle => next()`
    );
    next();
    return;
  }

  // start CAS cycle

  // remember current session to be able to find it again after the CAS cycle
  console.log("---[CAS]---> starting CAS cycle ...");
  req.session = req.session || {};
  req.session[options.session_targetUrl] = casHelpers.fullUrl(req);
  console.log(
    `---[CAS]---> targetUrl = ${req.session[options.session_targetUrl]}`
  );

  // build service URL
  let serviceUrl = casHelpers.buildServiceUrl(req);
  console.log(`---[CAS]---> set serviceUrl to ${serviceUrl}`);

  let redirectUrl = casHelpers.getCasServerUrl(`login`, {
    service: serviceUrl
  });

  console.log(`---[CAS]---> redirect to ${redirectUrl}`);
  res.redirect(redirectUrl);
}

module.exports = {
  init,
  casHandler,
  casRouter
};
