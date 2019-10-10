const CASAuthentication = require("./cas-authentication");
const url = require("url");
const _ = require("lodash");
var parseXML = require("xml2js").parseString;
var XMLprocessors = require("xml2js/lib/processors");
const logger = require("./logger");

const casRouterPrefix = "cas";

/**
 * list of current service tickets from the CAS server. Each ticket is an object of:
 * { casTicket {string}, sessionExpiresAt {number}, sessionId {string} }
 */
var currentTickets;

// CAS helper functions
var cas;

/**
 * list of current service tickets from the CAS server. Each ticket is an object of:
 * { casTicket {string}, sessionExpiresAt {number}, sessionId {string} }
 */
var currentTickets;

/**
 * authentication options
 *
 * All can be overriden in the "constructor", overwriting existing values. Options which are not overridden, remain
 * as assigned here, so these are the default values for all options.
 *
 * @param checkUser {function} function to be called on authentication. This function should check if the
 *   authenticated user (CAS login) is also known to the application. Signature of the function:
 *   checkUser(username, callback). The callback function is of signature (error, success). If should set error if
 *   if the user is not registered - in this case, a 403 (Forbidden) status is sent back to the client.
 *   The callback function has the signature (error, success). The error object will be returned
 *   to the client. If the error object contains a property 'statusCode', then this status code will be used as HTTP
 *   response status code (e.g. 403). If none is give, 403 (Forbidden) is used.
 *   Note that the success parameter of the callback function will not be used at the moment, so you don't need to
 *   provide it at all.
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
  casServer: null,
  backendBaseUrl: null, // necessary for node servers behind a reverse proxy which might manipulate the path so that the request at the node server does not know the correct entire path - we would not be able to reconstruct the absolute path for the redirect back to the client (target). So, this setting is necessary when the app sits behind a reverse proxy.
  checkUser: null,
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
  destroy_session: false
};

/**
 * redirect to a CAS server login page, providing the "original" URL to it, so that after successful
 * login, the CAS server can redirect back to the app
 *
 * @param req
 * @param res
 * @param next
 */
function casLogin(req, res, next) {
  if (!req.query.target) {
    res
      .status(400)
      .json(
        'ERROR at calling casLogin: missing mandatory query parameter "target"'
      );
    return;
  }

  /*
  logger.silly("dev mode?");
  if (options.devMode) {
    logger.silly("YEAH dev mode");
    req.session = req.session || {};
    req.session[options.sessionInfo] = options.devModeInfo;
    req.session[options.sessionName] = options.devModeUser;
    logger.silly("redirecting to: " + req.query.target);
    res.redirect(req.query.target + "?ticket=ST-1234");
    return;
  }
*/

  // no active session => bounce to CAS server
  req.query.returnTo = req.query.target;

  // remember deep link in session
  req.session = req.session || {};
  if (req.query.target) {
    req.session[options.session_targetUrl] = req.query.target;
    logger.silly("set returnTo to " + req.query.target + " => bounce_redirect");
  } else {
    logger.error("no target set for being used after the CAS login");
  }

  cas.bounce_redirect(req, res, next);
}

/**
 * redirects to frontend after successful CAS login
 *
 * @param req
 * @param res
 */
function redirectToFrontend(req, res) {
  var ticket;
  var targetUrl;

  ticket = req.query.ticket;
  if (ticket && ticket.substr(0, 3) === "ST-") {
    // service ticket received

    targetUrl = url.parse(
      req.session[options.session_targetUrl] || options.frontend_url,
      true
    );

    // add service ticket as query parameter
    targetUrl.query.ticket = ticket;

    res.redirect(url.format(targetUrl));
  } else {
    // no ticket given => standard GET request for the service URL, could be after a single logout,
    // so just redirect to the application
    logger.error("no service ticket found => redirect to frontend");
    res.redirect(options.frontend_url);
  }
}

/**
 * start a user session. A CAS service ticket must be included which will be used to get the user
 * information from the CAS server (via validate request)
 *
 * @param req
 * @param res
 * @param next
 */
function startSession(req, res, next) {
  var ticket;

  logger.silly(
    "++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ called startSession with ticket " +
      req.query.ticket
  );

  if (options.is_dev_mode) {
    res.json(options.dev_mode_info);
    return;
  }

  if (!req.query.ticket) {
    res
      .status(400)
      .json(
        'ERROR at calling startSession: missing mandatory CAS service ticket (query parameter "ticket")'
      );
    return;
  }

  // let CAS server validate the ticket and return user information
  logger.silly(
    "in startSession ... handling ticket the AJAX way with service " +
      options.serviceUrl
  );
  ticket = req.query.ticket;
  logger.verbose(
    "handling ticket [" +
      ticket +
      "], redirecting to serviceUrl [" +
      options.serviceUrl +
      "]"
  );
  cas.handleTicketAjax(ticket, options.serviceUrl, function(
    err,
    username,
    userAttributes
  ) {
    if (err) {
      logger.verbose(
        `!!!!! OUCH error from handleTicketAjax: ${err.code} - ${err.message}`
      );
      logger.error({
        code: 500,
        message: err.message,
        stack: err.stack
      });

      res.status(500).send(err.message);
      return;
    }

    // successfully validated ticket
    logger.verbose("successfully validated ticket " + ticket);

    // now we *authentifacted* the user. Now we should check the *authorization*
    if (options.checkUser) {
      if (typeof options.checkUser !== "function") {
        return Promise.reject("options.checkUser is not a function");
      }

      logger.verbose("checking user (checkUser function has been provided)");
      options
        .checkUser(username)
        .then(userData => {
          // no error => user valid! store user in session and advance to next route
          logger.silly(
            "checkUser returned success! So user is known to application."
          );

          startAppSession(req, username, userData);
          next();
        })
        .catch(err => {
          logger.debug("checkUser rejected user. Message: ${err}");
          if (err) {
            res.status(err.statusCode || 403).json(err);
            return;
          }
        });
    } else {
      logger.debug(
        "no checkUser configured => starting app session with only the username [" +
          username +
          "] "
      );
      startAppSession(req, username, username);

      next();
    }
  });
  logger.silly("finished handling ticket");
}

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
  req.session = req.session || {};
  req.session[options.sessionName] = username;
  if (options.sessionInfo) {
    // store any additional data from the CAS service
    req.session[options.sessionInfo] = userData || {};
  }
  sessionId = generateSessionId(options.tokenLength);
  currentTickets.push({
    casTicket: req.query.ticket,
    sessionId: sessionId,
    sessionExpiresAt: Date.now() + options.sessionExpireTime
  });
  req.session[options.session_sessionId] = sessionId;

  // store entire user object provided by the application (from checkUser) in session
  req.session.user = userData;

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
function possibleCasLogout(req, res, next) {
  var body;

  if (
    req.headers["content-type"] &&
    (req.headers["content-type"] === "text/xml" ||
      req.headers["content-type"] === "application/xml")
  ) {
    // hm ... XML document posted, could be a logout request?

    body = req.body;

    if (body.substring(0, 300).indexOf("<samlp:LogoutRequest") !== -1) {
      // body includes <samlp:LogoutRequest which indicates it is a logout request
      getTicketFromLogoutRequest(body, function(err, ticket) {
        if (err) {
          logger.error("failed to parse XML content?\n" + err);
          return;
        }

        // now we've got the ticket => invalidate the corresponding session
        invalidateSession(req, ticket);
        res.end();
      });
    } else {
      next();
    }
  } else {
    // if no logout XML document has been received, it is not a single logout requests => next
    next();
  }
}

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
  destroySession(req);
}

/**
 * blocks requests with a 401 error status if no session data are found
 *
 * @param req
 * @param res
 * @param next
 */
function block(req, res, next) {
  if (options.is_dev_mode) {
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
    return;
  } else {
    logger.debug("BLOCK: yes, found session, calling next()");
  }
  next();
}

/**
 * debug login function
 *
 * @param req
 * @param res
 */
function login(req, res) {
  req.session = req.session || {};
  req.session[options.sessionName] = "alex12";
  req.session.theUser = "michi also";
  req.session.timestamp = new Date();
  req.session.specialId = req.query && req.query.id ? req.query.id : -1;
  res.send("have a look into your cookie store!");
}

/**
 * debug logout function
 *
 * @param req
 * @param res
 */
function logout(req, res) {
  destroySession(req);

  // notify the CAS sever of the logout
  res.redirect(
    options.casServer +
      url.format({
        pathname: "/logout",
        query: {
          service: options.frontend_url,
          url: options.frontend_url
        }
      })
  );
}

/**
 * destroys the session
 *
 * @param req {object}
 */
function destroySession(req) {
  req.session = null;
}

/**
 * stores all options in the module options. Throws an error if an unknown option is given
 *
 * @param _options {object}
 * @return {object} options the options (will be stored in module scope as well)
 * @throws Error if an unknown option has been used
 */
function registerOptions(_options) {
  // ensure that only options can be set which are defined in the initial options object. Thus, no unknown options
  // are possible
  Object.keys(_options).forEach(function(option) {
    if (options.hasOwnProperty(option)) {
      options[option] = _options[option];
      /*
      // check if service url contains '/cas' path
      if (option === "serviceUrl") {
        // etract path portion of URL (rest of string after host name)
        let urlPathMatches = /^[^:]+:\/\/[^\/]+(\/.+)?$/.exec(
          options.serviceUrl
        );
        if (urlPathMatches && urlPathMatches.length > 1) {
          let serviceUrl = urlPathMatches[1] || "";
          if (serviceUrl.substring(serviceUrl.length - 4) !== "/cas")
            options.serviceUrl +=
              serviceUrl[serviceUrl.length - 1] === "/" ? "cas" : "/cas";
        }
      }
    */
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

  // default options
  options.tokenLength = options.tokenLength || 10;

  return options;
}

function getTargetUrl(req) {
  var targetUrl = req.session && req.session[options.session_targetUrl];

  if (targetUrl) {
    // remove target URL, not needed anymore
    delete req.session[options.session_targetUrl];
  }
  return targetUrl;
}

/**
 * redirect to a previously registered target (for deep linking after CAS login)
 */
function redirectToTarget(req, res) {
  var targetUrl = getTargetUrl(req);
  logger.silly("redirecting to target URL: " + targetUrl);
  if (!targetUrl) {
    // no specific target given => simply redirect to the application
    logger.debug("no target URL registered => redirect to frontend");
    targetUrl = options.frontend_url;
  }
  res.redirect(targetUrl);
}

/**
 * Returns the target url that was registered on login
 */
function returnTargetUrl(req, res) {
  res.json(getTargetUrl(req));
}

/**
 * checks for revoked tickets. If the current ticket (from the session) has already been revoked (single logout), the
 * session info is removed
 */
function checkForRevokedTickets(req, res, next) {
  var sessionInfo;
  var now;

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
}

/**
 * run the check for expired tickets each interval
 *
 * use setTimeout instead of setInterval in order to make sure that
 * there can be no overlapping execution of two instances of the
 * periodic job
 *
 * @param interval {number} check interval in minutes
 */
function periodicRemoveExpiredTickets(interval) {
  if (!interval) {
    // disable checking for expired tickets
    return;
  }

  logger.silly("------ remove expired tickets ------");
  logger.silly("--" + new Date());
  removeExpiredTickets();

  // schedule next task
  setTimeout(periodicRemoveExpiredTickets, 1000 * 60 * interval);
}

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
 * just checks if there is an existing session. If not, a 401 is sent. If a session is found, an empty 200 is sent.
 *
 * @param req {object}
 * @param res {object}
 */
function ensureSession(req, res) {
  if (options.is_dev_mode) {
    res.end();
  }

  if (!isActiveSession(req.session)) {
    logger.silly(
      "BLOCK: no, no session found (" +
        req.originalUrl +
        "..." +
        JSON.stringify(req.query) +
        ")"
    );
    res.status(401).send("You need to be logged in to perform this request");
    return;
  }
  res.end();
}

/**
 * checks whethe the request contains a valid session or not
 *
 * @param session {object} session object (already filled by some preceding middleware, e.g. cookie-session
 * @return {boolean} true if there is an existing session. False if not.
 */
function isActiveSession(session) {
  if (options.is_dev_mode) {
    return true;
  }

  return session && session[options.sessionName];
}

/**
 * if the given content is a valid CAS logout request (XML document for single logout), it extracts
 * the included service ticket ID and returns it
 *
 * @param body {string} the XML document which might be a logout request
 * @param callback {function} callback function that will be called with (err, serviceTicket)
 */
function getTicketFromLogoutRequest(body, callback) {
  parseXML(
    body,
    {
      trim: true,
      normalize: true,
      explicitArray: false,
      tagNameProcessors: [XMLprocessors.normalize, XMLprocessors.stripPrefix]
    },
    function(err, result) {
      if (err) {
        console.info(
          "(((((---))))))) Bad XML document, could not recognize logout document"
        );
        return callback(new Error("Response from CAS server was bad."));
      }
      try {
        console.info("(((((---))))))) response: " + JSON.stringify(result));
        var serviceTicket = result.logoutrequest.sessionindex;
        if (serviceTicket) {
          return callback(null, serviceTicket);
        } else {
          return callback({
            errorMessage: "no valid CAS logout document",
            code: "NO_VALID_CAS_LOGOUT",
            description:
              "service ticket could not be found in the XML logout document"
          });
        }
      } catch (err) {
        console.info(
          "(((((---))))))) exception when doing CAS authentication: " +
            JSON.stringify(err)
        );
        return callback(new Error("CAS authentication failed."));
      }
    }
  );
}

/**
 * initialisation functions
 *
 * @return {object} the module itself (for fluid interface syntax like const cas = require('cas-authentication-middleware').init(...))
 */
function init(_options) {
  options = registerOptions(_options);

  currentTickets = []; // init current CAS tickets
  periodicRemoveExpiredTickets(options.expiredSessionsCheckInterval);

  cas = CASAuthentication(options);

  return module.exports;
}

/**
 * build the full (absolute) URL
 *
 * @param {()} req
 */ function fullUrl(req) {
  return url.format({
    protocol: req.protocol,
    host: req.get("host"),
    pathname: req.originalUrl
  });
}

/**
 * build the full (absolute) URL
 *
 * @param {()} req
 */ function fullUrl2(urlComponents) {
  return url.format({
    protocol: urlComponents.protocol,
    host: urlComponents.host,
    pathname: urlComponents.pathname
  });
}

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
function getServiceUrl(req) {
  let urlComponents = getUrlComponents(req);

  //TODO fuer hinter einem reverse proxy gilt dieser Code:
  if (options.backendBaseUrl) {
    options.serviceUrl =
      options.backendBaseUrl + `/${casRouterPrefix}/validate`;
    return options.serviceUrl;
  }
  throw new Error(
    "ups, keine BackendBaseUrl angegeben - der Rest funktioniert vielleicht nicht???"
  ); // TODO funktioniert ohne backendBaseUrl nicht hinter einem reverse proxy:

  // TODO funktioniert ohne backendBaseUrl nicht hinter einem reverse proxy:
  options.serviceUrl = fullUrl2({
    protocol: urlComponents.protocol,
    host: urlComponents.host,
    pathname: `${casRouterPrefix}/validate`
  });
  cas.setServiceUrl(options.serviceUrl);
  return options.serviceUrl;
}

function getCasServerUrl(path, query) {
  let urlComponents = url.parse(options.casServer);
  return url.format(
    Object.assign(urlComponents, {
      pathname: [urlComponents.pathname, path].join("/"),
      query: query
    })
  );
}

function getCasCycleUrl(req, path, query) {
  let urlComponents = url.parse(req.originalUrl);
  return url.format(
    Object.assign(urlComponents, {
      pathname: [urlComponents.pathname, path].join("/"),
      query: query
    })
  );
}

module.exports = {
  block,
  possibleCasLogout,
  checkForRevokedTickets,
  redirectToFrontend,
  startSession,
  casLogin,
  login,
  logout,
  redirectToTarget,
  returnTargetUrl,
  ensureSession,
  init,
  options,
  registerOptions,
  periodicRemoveExpiredTickets,
  fullUrl,
  getServiceUrl,
  getCasServerUrl,
  getCasCycleUrl
};
