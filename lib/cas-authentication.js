var url = require("url");
var request = require("request");
var parseXML = require("xml2js").parseString;
var XMLprocessors = require("xml2js/lib/processors");
const logger = require("./logger");

/**
 * CAS options
 *
 * @typedef {Object} CAS_options
 * @property {string}  casServer
 * @property {string}  serviceUrl
 * @property {('1.0'|'2.0'|'3.0')} [cas_version='3.0']
 * @property {boolean} [renew=false]
 * @property {string}  [sessionName='cas_user']
 * @property {string}  [sessionInfo=false]
 * @property {boolean} [destroy_session=false]
 */
var options = {
  casServer: null,
  serviceUrl: null,
  sessionInfo: "cas_userinfo",
  sessionName: "cas_user",
  cas_version: "2.0",
  renew: false,
  destroy_session: false,
  devMode: false,
  devModeUser: null
};

/**
 * validates a ticket for CAS protocol version 2.0 or 3.0
 *
 * @param body {string} the email body which should be parsed in order to check the ticket validation
 * @param callback {function} callback function that will be called with (err, user, userAttributes)
 */
function validateTicket(body, callback) {
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
        logger.info("(((((---))))))) Bad response from CAS server");
        return callback(new Error("Response from CAS server was bad."));
      }
      //try {
      logger.info("(((((---))))))) response: " + JSON.stringify(result));
      var failure = result.serviceresponse.authenticationfailure;
      if (failure) {
        //return callback(new Error('CAS authentication failed (' + failure.$.code + ').'));
        logger.info("(((((---))))))) CAS authentication failed");
        return callback({
          errorMessage: "CAS authentication failed",
          code: failure.$.code,
          description: failure._
        });
      }
      var success = result.serviceresponse.authenticationsuccess;
      if (success) {
        return callback(null, success.user, success.attributes);
      } else {
        logger.info("(((((---))))))) CAS authentication failed apparently");
        return callback(new Error("CAS authentication failed."));
      }
    }
  );
}

/**
 * if the given content is a valid CAS logout request (XML document for single logout), it extracts
 * the included service ticket ID and returns it
 *
 * @param document {string} the XML document which might be a logout request
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
        logger.info(
          "(((((---))))))) Bad XML document, could not recognize logout document"
        );
        return callback(new Error("Response from CAS server was bad."));
      }
      try {
        debugger;
        logger.info("(((((---))))))) response: " + JSON.stringify(result));
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
        logger.info(
          "(((((---))))))) exception when doing CAS authentication: " +
            JSON.stringify(err)
        );
        return callback(new Error("CAS authentication failed."));
      }
    }
  );
}

/**
 * Bounces a request with CAS authentication. If the user's session is not
 * already validated with CAS, their request will be redirected to the CAS
 * login page.
 */
function bounce_redirect(req, res, next) {
  // If the session has been validated with CAS, no action is required.
  if (req.session[options.sessionName]) {
    if (req.query.redirectTo) {
      res.redirect(req.query.returnTo);
    } else {
      res.redirect(req.session.cas_return_to);
    }
  } else {
    // Otherwise, redirect the user to the CAS login.
    login(req, res, next);
  }
}

/**
 * Redirects the client to the CAS login.
 */
function login(req, res, next) {
  // Save the return URL in the session. If an explicit return URL is set as a
  // query parameter, use that. Otherwise, just use the URL from the request.
  req.session.cas_return_to =
    req.query.returnTo || url.parse(req.originalUrl).path;

  // Set up the query parameters.
  var query = {
    //service: req.query.returnTo || this.serviceUrl + url.parse(req.originalUrl).pathname,
    service: options.serviceUrl // for AJAX
  };

  // only add renew parameter if renew is truish
  if (options.renew) {
    query.renew = "true"; // according to CAS spec, the string "true" should be used as a truish value
  }

  // Redirect to the CAS login.
  res.redirect(
    options.casServer +
      url.format({
        pathname: "/login",
        query: query
      })
  );
}

/**
 * Logout the currently logged in CAS user.
 */
function logout(req, res, next) {
  // Destroy the entire session if the option is set.
  if (options.destroy_session) {
    req.session.destroy(function(err) {
      if (err) {
        logger.error(err);
      }
    });
  }
  // Otherwise, just destroy the CAS session variables.
  else {
    delete req.session[options.sessionName];
    if (options.sessionInfo) {
      delete req.session[options.sessionInfo];
    }
  }

  // Redirect the client to the CAS logout.
  res.redirect(options.casServer + "/logout");
}

/**
 * Handles the ticket generated by the CAS login requester and validates it with the CAS login acceptor.
 *
 * @param ticket {string} the CAS service ticket to be validated
 * @param serviceUrl {string} the service URL to be used for ticket validation
 * @param callback {function} callback will be called with callback(err, user, attributes)
 *   err ... error
 *   user ... user ID
 *   attributes ... additional user attributes, if any have been returned
 */
function handleTicketAjax(ticket, serviceUrl, callback) {
  var requestOptions;

  logger.info("+++++++++++++__+_+_+_+_+_+_+_  in cas.handleTicketAjax ...");

  if (["1.0", "2.0", "3.0"].indexOf(options.cas_version) >= 0) {
    requestOptions = {
      uri:
        options.casServer +
        (options.cas_version === "3.0"
          ? "/p3/serviceValidate"
          : "/serviceValidate"),
      qs: {
        service: serviceUrl,
        ticket: ticket
      }
    };
  }

  logger.info("requesting: " + JSON.stringify(requestOptions), null, 2);
  request.get(requestOptions, function(err, response, body) {
    if (err) {
      callback(err);
      return;
    }

    logger.info("ticket data received: " + body);
    validateTicket(body, function(err, user, attributes) {
      if (err) {
        callback(err);
      } else {
        callback(null, user, attributes);
      }
    });
  });

  logger.info("end of cas._handleTicket ...");
}

/**
 * parses and sets the options
 *
 * @param _options {object} the options
 */
function setOptions(_options) {
  if (!options || typeof options !== "object") {
    throw new Error(
      "CAS Authentication was not given a valid configuration object."
    );
  }

  // ensure that only options can be set which are defined in the initial options object. Thus, no unknown options
  // are possible
  Object.keys(_options).forEach(function(option) {
    if (options.hasOwnProperty(option)) {
      options[option] = _options[option];
    } else {
      logger.warn('unknown option "' + option + '"');
    }
  });

  if (!options.casServer) {
    throw new Error("CAS Authentication requires a casServer parameter.");
  }

  /*
  if (!options.serviceUrl) {
    throw new Error("CAS Authentication requires a serviceUrl parameter.");
  }
  */
  if (options.cas_version !== "2.0" && options.cas_version !== "3.0") {
    throw new Error(
      'The supplied CAS version ("' +
        options.cas_version +
        '") is not supported.'
    );
  }

  var parsed_cas_url = url.parse(options.casServer);

  // TODO do not stuff into options:
  options.cas_host = parsed_cas_url.hostname;
  options.cas_path = parsed_cas_url.pathname;

  logger.info("----- CAS url: " + options.casServer);
  logger.info("----- CAS path: " + options.cas_path);
}

/**
 * set the service URL, which is an absolute URL pointing to the application which uses the
 * CAS login
 *
 * @param {string} serviceUrl
 */
function setServiceUrl(serviceUrl) {
  options.serviceUrl = serviceUrl;
}

module.exports = function(options) {
  setOptions(options);

  return {
    bounce_redirect,
    logout,
    handleTicketAjax,
    setServiceUrl
  };
};
