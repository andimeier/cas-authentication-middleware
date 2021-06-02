const CASAuthentication = require("./cas-authentication");
const _ = require("lodash");
const logger = require("./logger");

exports.logout = CASAuthentication.logout;

/**
 * list of current service tickets from the CAS server. Each ticket is an object of:
 * { casTicket {string}, sessionExpiresAt {number}, sessionId {string} }
 */
var currentTickets;

// CAS helper functions
/** @type {import("./cas-authentication")} */
var cas;

/**
 * authentication options
 *
 * All can be overriden in the "constructor", overwriting existing values. Options which are not overridden, remain
 * as assigned here, so these are the default values for all options.
 *
 * @param checkUser {function} function to be called on authentication. This function should check if the
 *   authenticated user (CAS login) is also known to the application. Signature of the function:
 *   `checkUser(username): Promise<string|object>`. It should reject if
 *   if the user is not registered - in this case, a 403 (Forbidden) status is sent back to the client.
 *   The error object will be returned
 *   to the client. If the error object contains a property 'statusCode', then this status code will be used as HTTP
 *   response status code (e.g. 403). If none is give, 403 (Forbidden) is used.
 * @param expiredSessionsCheckInterval {number} number of minutes between "session ticket garbage collection". Every
 *   such interval the registered session tickets are checked if any session has already expired. These expired
 *   sessions are then disposed. Set this parameter to 0 if you don't want any garbage collection to occur. Note that
 *   in this case, the number of "known" tickets will steadily increase during the lifetime of the application - which
 *   is possibly not what you want
 * @param tokenLength {number} length of session ID string, should be a good compromise between length (will be
 *   sent on every request in the session cookie) and security (the less characters, the more likely collisions will
 *   occur)
 */
var options = {
  casRouterPrefix: "/cas",
  casServer: null,
  backendBaseUrl: null, // necessary for node servers behind a reverse proxy which might manipulate the path so that the request at the node server does not know the correct entire path - we would not be able to reconstruct the absolute path for the redirect back to the client (target). So, this setting is necessary when the app sits behind a reverse proxy.
  checkUser: null,
  onUnauthorizedUser: null, // will be called when the user was not authorized
  expiredSessionsCheckInterval: 60,
  tokenLength: 10,
  devModeInfo: {
    userId: "testuser",
    realName: "Max User"
  },
  frontend_url: null,
  devMode: false,
  devModeUser: null,
  serviceUrl: null,
  sessionInfo: "cas_userinfo",
  sessionName: "userId",
  session_sessionId: "sub", // name of cookie variable to hold the application session ID (sub = JWT subject)
  session_targetUrl: "cas_target_url", // application URL to be called after successful CAS cycle
  sessionExpireTime: 24 * 60 * 60 * 1000, // in seconds
  cas_version: "2.0",
  renew: false,
  destroy_session: false,
  logger: null
};
exports.options = options;

/**
 * redirect to a CAS server login page, providing the "original" URL to it, so that after successful
 * login, the CAS server can redirect back to the app
 *
 * @param req
 * @param res
 * @param next
 */
exports.casLogin = function casLogin(req, res, next) {
  if (!req.query.target) {
    res
      .status(400)
      .json(
        'ERROR at calling casLogin: missing mandatory query parameter "target"'
      );
    return;
  }

  // set the correct service url
  cas.setServiceUrl(exports.getServiceUrl(req));

  // no active session => bounce to CAS server
  req.query.returnTo = req.query.target;

  // remember deep link in session
  exports.checkSession(req);
  if (req.query.target) {
    req.session[options.session_targetUrl] = req.query.target;
    logger.silly("set returnTo to " + req.query.target);
  } else {
    logger.error("no target set for being used after the CAS login");
  }

  if (options.devMode) {
    req.session[options.sessionInfo] = options.devModeInfo;
    req.session[options.sessionName] = options.devModeUser;
    logger.verbose(`dev mode => set session user to ${options.devModeUser}`);
    // assume successful login via cas
    exports.startSession(req, res, next);
    return;
  }

  cas.bounce_redirect(req, res, next);
};

/**
 * redirects to frontend after successful CAS login
 *
 * @param req
 * @param res
 */
exports.redirectToFrontend = function redirectToFrontend(req, res) {
  var ticket;
  var targetUrl;
  exports.checkSession(req);
  const target = req.session[options.session_targetUrl] || options.frontend_url;

  logger.info("redirecting to target");

  ticket = req.query.ticket;
  if (ticket && ticket.substr(0, 3) === "ST-") {
    // service ticket received

    targetUrl = new URL(target);

    // add service ticket as query parameter
    targetUrl.searchParams.set("ticket", ticket);

    res.redirect(targetUrl.href);
  } else {
    // no ticket given => standard GET request for the service URL, could be after a single logout,
    // so just redirect to the application
    res.redirect(target);
  }
};

/**
 * start a user session. A CAS service ticket must be included which will be used to get the user
 * information from the CAS server (via validate request)
 *
 * @param req
 * @param res
 * @param next
 */
exports.startSession = function startSession(req, res, next) {
  var ticket;

  logger.silly(
    "called startSession with ticket " + req.query.ticket
  );

  if (!req.query.ticket && !options.devMode) {
    res
      .status(400)
      .json(
        'ERROR at calling startSession: missing mandatory CAS service ticket (query parameter "ticket")'
      );
    return;
  }

  // let CAS server validate the ticket and return user information
  logger.silly(
    (options.devMode ? "[dev mode] " : "") +
    "in startSession ... handling ticket the AJAX way with service " +
    options.serviceUrl
  );
  ticket = req.query.ticket;
  // since we are handling the ticket here, the following routes and the client don't need the ticket
  delete req.query.ticket;
  logger.verbose(
    (options.devMode ? "[dev mode] " : "") +
    "handling ticket [" +
    ticket +
    "], redirecting to serviceUrl [" +
    options.serviceUrl +
    "]"
  );
  if (options.devMode) {
    exports.startSessionTicketCallback(req, res, next, ticket)({
      user: options.devModeUser
    });
  } else {
    cas.handleTicketAjax(ticket, options.serviceUrl)
      .then(
        exports.startSessionTicketCallback(req, res, next, ticket),
        (err) => {
          logger.verbose(
            `${options.devMode ? "[dev mode] " : ""}error from handleTicketAjax: ${err.code} - ${err.message}`
          );
          logger.error({
            code: 500,
            message: err.message,
            stack: err.stack
          });

          res.status(500).send(err.message);
        }
      );
  }
  logger.silly("finished handling ticket");
};

exports.startSessionTicketCallback = function startSessionTicketCallback(
  req,
  res,
  next,
  ticket
) {
  return function({ user, attributes }) {
    // successfully validated ticket
    logger.verbose(
      (options.devMode ? "[dev mode] " : "") +
      "successfully validated ticket " + ticket + " for user " + user
    );

    // now we *authentificated* the user. Now we should check the *authorization*
    if (options.checkUser) {
      if (typeof options.checkUser !== "function") {
        throw new TypeError("options.checkUser is not a function");
      }

      logger.verbose((options.devMode ? "[dev mode] " : "") + "checking user (checkUser function has been provided)");
      options
        .checkUser(user)
        .then(userData => {
          // no error => user valid! store user in session and advance to next route
          logger.silly(
            (options.devMode ? "[dev mode] " : "") +
            "checkUser returned success! So user is known to application."
          );

          startAppSession(req, user, userData);
          next();
        })
        .catch(err => {
          logger.debug(`${options.devMode ? "[dev mode] " : ""}checkUser rejected user. Message: ${err}`);
          if (typeof options.onUnauthorizedUser !== "function") {
            res.status(err.statusCode || 403).json(err);
          } else if (options.onUnauthorizedUser(req, res, user, err)) {
            next();
          }
        });
    } else {
      logger.debug(
        (options.devMode ? "[dev mode] " : "") +
        "no checkUser configured => starting app session with only the username [" +
        user +
        "] "
      );
      startAppSession(req, user, {});

      next();
    }
  };
};

/**
 * start application session
 *
 * @param {object} req express request object, will be populated with session info
 * @param {string} username
 * @param {object} userData user data to be stored in the app session
 */
function startAppSession(req, username, userData) {
  var sessionId;

  // start session
  // -------------
  exports.checkSession(req);
  req.session[options.sessionName] = username;
  sessionId = generateSessionId(options.tokenLength);
  currentTickets.push({
    casTicket: req.query.ticket,
    sessionId: sessionId,
    sessionExpiresAt: Date.now() + options.sessionExpireTime
  });
  req.session[options.session_sessionId] = sessionId;

  // store entire user object provided by the application (from checkUser) in session
  if (options.sessionInfo) {
    req.session[options.sessionInfo] = userData || {};
  }

  logger.debug("req.session is: " + JSON.stringify(req.session, null, 2));
}

/**
 * checks if there is a single logout request. If an CAS single logout XML document is recognized, a logout is
 * performed. Otherwise, this middleware does nothing and hands control over to the next route.
 *
 * @param req
 * @param res
 * @param next
 */
exports.possibleCasLogout = function possibleCasLogout(req, res, next) {
  var body;
  let handled = false;

  if (
    req.headers["content-type"] &&
    (req.headers["content-type"] === "text/xml" ||
      req.headers["content-type"] === "application/xml")
  ) {
    // hm ... XML document posted, could be a logout request?

    body = req.body;

    if (body.substring(0, 300).indexOf("<samlp:LogoutRequest") !== -1) {
      handled = true;
      // body includes <samlp:LogoutRequest which indicates it is a logout request
      cas.getTicketFromLogoutRequest(body)
        .then((ticket) => {
          // now we've got the ticket => invalidate the corresponding session
          invalidateSession(req, ticket);
          next();
        }, (error) => {
          logger.error("failed to parse XML content?\n" + error);
        });
    }
  }

  if (!handled)
    next();
};

/** invalidates a session associated with a given CAS service ticket
 *
 * @param req {object} request object, needed for invalidating the session
 * @param ticket {string} a CAS service ticket which is associated with a session
 */
function invalidateSession(req, ticket) {
  logger.silly("removing ticket " + ticket);
  _.remove(currentTickets, { casTicket: ticket });

  // session to expire found?
  logger.silly("invalidating session for ticket " + ticket);
  cas.destroySession(req);
}

/**
 * blocks requests with a 401 error status if no session data are found
 *
 * @param req
 * @param res
 * @param next
 */
exports.block = function block(req, res, next) {
  if (options.devMode) {
    next();
    return;
  }

  if (!isActiveSession(req.session)) {
    logger.debug(
      "BLOCK: no, no session found (" +
      req.originalUrl +
      "..." +
      JSON.stringify(req.query) +
      ")"
    );
    res.status(401).send("You need to be logged in to perform this request");
  } else {
    logger.debug("BLOCK: yes, found session, calling next()");
    next();
  }
};

/**
 * stores all options in the module options. Throws an error if an unknown option is given
 *
 * @param _options {object}
 * @return {object} options the options (will be stored in module scope as well)
 * @throws Error if an unknown option has been used
 */
exports.registerOptions = function registerOptions(_options) {
  // ensure that only options can be set which are defined in the initial options object. Thus, no unknown options
  // are possible
  Object.keys(_options).forEach(function(option) {
    if (Object.prototype.hasOwnProperty.call(options, option)) {
      options[option] = _options[option];
    } else {
      throw new Error('unknown option "' + option + '"');
    }
  });

  // validate options
  // ================

  if (options.checkUser && typeof options.checkUser !== "function") {
    throw new Error(
      'config option "checkUser" must be a function, but is a ' +
      typeof options.checkUser
    );
  }
  if (typeof options.backendBaseUrl === "string" ? options.backendBaseUrl.length === 0 : options.backendBaseUrl !== false) {
    throw new Error(
      'config option "backendBaseUrl" is required and must be either a string with length greater than 0 or boolean false'
    );
  }

  // default options
  options.tokenLength = options.tokenLength || 10;

  return options;
};

function getTargetUrl(req) {
  exports.checkSession(req);
  var targetUrl = req.session && req.session[options.session_targetUrl];

  if (targetUrl) {
    // remove target URL, not needed anymore
    delete req.session[options.session_targetUrl];
  }
  return targetUrl;
}

/**
 * Returns the target url that was registered on login
 */
exports.returnTargetUrl = function returnTargetUrl(req, res) {
  res.json(getTargetUrl(req));
};

/**
 * checks for revoked tickets. If the current ticket (from the session) has already been revoked (single logout), the
 * session info is removed
 */
exports.checkForRevokedTickets = function checkForRevokedTickets(
  req,
  res,
  next
) {
  var sessionInfo;

  var casSessionId = req.session && req.session[options.session_sessionId];
  if (casSessionId) {
    // check session
    sessionInfo = _.find(currentTickets, { sessionId: casSessionId });

    if (!sessionInfo || sessionInfo.sessionExpiresAt < Date.now()) {
      // session not found or expired
      invalidateSession(req, sessionInfo && sessionInfo.ticket);
    }
  }

  next();
};

/**
 * run the check for expired tickets each interval
 *
 * use setTimeout instead of setInterval in order to make sure that
 * there can be no overlapping execution of two instances of the
 * periodic job
 *
 * @param interval {number} check interval in minutes
 */
exports.periodicRemoveExpiredTickets = function periodicRemoveExpiredTickets(
  interval
) {
  if (!interval) {
    // disable checking for expired tickets
    return;
  }

  logger.silly("------ remove expired tickets ------");
  logger.silly("--" + new Date());
  removeExpiredTickets();

  // schedule next task
  setTimeout(periodicRemoveExpiredTickets, 1000 * 60 * interval);
};

/**
 * removes all session info from session which already have expired
 *
 * This function should be called periodically (this is sort of garbage collection)
 */
function removeExpiredTickets() {
  var removedTickets;

  logger.silly("check for expired tickets ...");

  removedTickets = _.remove(currentTickets, function(sessionInfo) {
    sessionInfo.sessionExpiresAt < Date.now();
  });

  if (removedTickets.length) {
    logger.silly(
      "removed the following ticket because session has expired: " +
      _.map(removedTickets, "casTicket").join(",")
    );
  }
}

/**
 * generate random string to be used as a token, using the characters a-z, A-Z and 0-9
 *
 * @param tokenLength {number} length of the generated string
 * @returns {string}
 */
function generateSessionId(tokenLength) {
  var text = "";
  var possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var i;
  var numberOfChars;

  numberOfChars = possible.length;
  for (i = 0; i < tokenLength; i++)
    text += possible.charAt(Math.floor(Math.random() * numberOfChars));

  return text;
}

/**
 * checks whethe the request contains a valid session or not
 *
 * @param session {object} session object (already filled by some preceding middleware, e.g. cookie-session
 * @return {boolean} true if there is an existing session. False if not.
 */
function isActiveSession(session) {
  if (options.devMode) {
    return true;
  }

  return session && session[options.sessionName];
}

/**
 * initialisation functions
 *
 * @return {object} the module itself (for fluid interface syntax like const cas = require('cas-authentication-middleware').init(...))
 */
exports.init = function init(_options) {
  options = exports.registerOptions(_options);

  currentTickets = []; // init current CAS tickets
  exports.periodicRemoveExpiredTickets(options.expiredSessionsCheckInterval);

  cas = CASAuthentication.init(options);

  return module.exports;
};

/**
 * build the full (absolute) URL
 *
 * @param {()} req
 */
exports.fullUrl = function fullUrl(req) {
  const url = new URL(req.originalUrl, req.get("host"));
  url.protocol = req.protocol;
  url.host = req.get("host");
  return url.href;
};

/**
 * build the full (absolute) URL
 *
 * @param {()} req
 */
exports.fullUrl = function fullUrl2(urlComponents) {
  const url = new URL(urlComponents.pathname, urlComponents.host);
  url.protocol = urlComponents.protocol;
  url.host = urlComponents.host;
  return url.href;
};

function getUrlComponents(req) {
  return {
    protocol: req.protocol,
    host: req.get("host"),
    path: req.originalUrl
  };
}

/**
 * build the service URL. The service URL is the URL sent to the CAS server which should be redirected to after sucessful
 * CAS login. It will receive the TGT (ticket granting ticket) from the CAS server and is responsible for validating the ticket
 * in order to finally receive the user data.
 * The "real" service URL, IOW the originally requested page will be reconstructed from the session between app frontend and app backend
 * (has been registered in the session). This will be done by /cas/validate after validating the CAS ticket and retrieving the user
 * session.
 *
 * The serviceUrl will be stored instantly, so it can be used for the next steps in the CAS cycle (e.g. validating the ticket)
 *
 * @param {*} req
 */
exports.getServiceUrl = function getServiceUrl(req) {
  let urlComponents = getUrlComponents(req);

  // behind a reverse proxy we need to know the url which redirects to here
  if (options.backendBaseUrl) {
    options.serviceUrl =
      options.backendBaseUrl + `/${options.casRouterPrefix.replace(/^\/+/, "")}/validate`;
    return options.serviceUrl;
  }

  // backendBaseUrl was explicitly false => no reverse proxy
  options.serviceUrl = exports.fullUrl2({
    protocol: urlComponents.protocol,
    host: urlComponents.host,
    pathname: `${options.casRouterPrefix}/validate`
  });
  return options.serviceUrl;
};

exports.getCasServerUrl = function getCasServerUrl(path, query) {
  return formatUrl(options.casServer, path, query);
};

exports.getCasCycleUrl = function getCasCycleUrl(req, path, query) {
  return formatUrl(req.originalUrl, path, query);
};

/**
 * Returns the full path to where you can make a redirect behind a reverse proxy with optional paths
 * @param {string[]} paths
 */
exports.getUrlPathToSelf = function getUrlPathToSelf(...paths) {
  return "/" + (options.backendBaseUrl
    ? joinUrlPath(new URL(options.backendBaseUrl).pathname, ...paths)
    : joinUrlPath(...paths));
};

function joinUrlPath(...paths) {
  let res = [];
  for (let p of paths) res = res.concat(p.split("/"));
  return res.filter((p) => p.length).join("/");
}

function formatUrl(uri, path, query) {
  const url = new URL(uri);
  url.pathname = path;
  url.search = query;
  return url.href;
}

exports.checkSession = function checkSession(req) {
  if (!req.session) {
    throw new Error("No session object found");
  }
};

