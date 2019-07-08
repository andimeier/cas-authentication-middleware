const _ = require("lodash");
const casRouter = require("./lib/cas-router.js");
const casHelpers = require("./lib/cas-helper-functions");

// name of session property holding the user ID
const session_userId = "userId";

/**
 * initialisation functions
 *
 * @return {object} the module itself (for fluid interface syntax like const cas = require('cas-authentication-middleware').init(...))
 */
function init(_options) {
  options = casHelpers.registerOptions(_options);

  casHelpers.periodicRemoveExpiredTickets(options.expiredSessionsCheckInterval);

  casHelpers.init(_options);
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
  req.session[options.session_targetUrl] = getAbsoluteUrl(req);
  console.log(
    `---[CAS]---> targetUrl = ${req.session[options.session_targetUrl]}`
  );

  // build service URL
  let serviceUrl = casHelpers.getServiceUrl(req);
  console.log(`---[CAS]---> set serviceUrl to ${serviceUrl}`);

  let casServerUrl = casHelpers.getCasServerUrl(`login`, {
    service: serviceUrl
  });

  console.log(`---[CAS]---> redirect to ${casServerUrl}`);
  res.redirect(casServerUrl);
}

/**
 * Build an absolute URL pointing to exactly the page which has been requested
 * right now. This is necessary to "park" the URL and later, after CAS login,
 * perform a redirect to it. This enabled us to do "deep linking".
 *
 * Following the discussion on
 * https://stackoverflow.com/questions/10183291/how-to-get-the-full-url-in-express,
 * I decided to use the function like this
 * @param {*} req
 */
function getAbsoluteUrl(req) {
  return req.protocol + "://" + req.get("host") + req.originalUrl;
}

module.exports = {
  init,
  casHandler,
  casRouter
};
