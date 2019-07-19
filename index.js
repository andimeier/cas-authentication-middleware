const _ = require("lodash");
const casRouter = require("./lib/cas-router.js");
const casHelpers = require("./lib/cas-helper-functions");

// name of session property holding the user ID
const session_userId = "userId";

let devMode = {
  enabled: false,
  user: null,
  info: null
};


/**
 * initialisation functions
 *
 * @return {object} the module itself (for fluid interface syntax like const cas = require('cas-authentication-middleware').init(...))
 */
function init(_options) {
  let options = casHelpers.registerOptions(_options);

  console.log('NEW NEW NEW NEW NEW NEW, dev mode: ' + options.devMode);

  if (options.devMode) {
    devMode.enabled = true;
    devMode.user = options.devModeUser;
    devMode.info = options.devModeInfo;
    console.log(`dev mode => the user to be used would be: ${devMode.user} (not set yet, this is just an info)`);
  }

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
  let options = casHelpers.options;

  if (req.session && req.session[options.sessionName]) {
    console.log(
      `---[CAS]---> session available (userId: ${
        req.session[options.sessionName]
      }) => no CAS cycle => next()`
    );
    next();
    return;
  }

  // no session user => start CAS cycle?
  if (devMode.enabled) {
    req.session = req.session || {};
    req.session[options.sessionName] = devMode.user;
    req.session[options.sessionInfo] = devMode.info;
    console.log(`---[CAS]---> ---> dev mode => set session user to ${devMode.user}`);
    next();
    return;
  } else {
    console.log('---[CAS]---> not in dev mode');
  }

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


/**
 * return user data of the session user.
 *
 * @param req   The request object
 * @return {object} the session user object consisting of { userId, userInfo}. userId is the ID of the logged in user,
 *   userInfo is any additional information we got from the CAS server as user attributes. The "userInfo" property can
 *   be null if not set. If no active session is in place, the returned object will contain only the property "userId" with
 *   a value of null.
 */
function getSessionInfo(req) {
  let options = casHelpers.options;

  if (req.session && req.session[options.sessionName]) { 
    return {
      userId: req.session[options.sessionName],
      userInfo: req.session[options.sessionInfo]
    };
  } else {
    return {
      userId: null
    };
  }
}


module.exports = {
  init,
  casHandler,
  casRouter,
  getSessionInfo
};
