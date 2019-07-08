# Express CAS Middleware

This is a CAS authentication library designed to be used as middleware in an Express server.

## Installation

    npm install cas-authentication-middleware

## Setup

```javascript
const cas = require("cas-authentication-middleware").init({
  casServer: "http://cas.server.url"
});
```

The `init` function receives an option object:

    cas.init(options);

The most basic config options are:

### Options

The following basic options are required:

| Name       |   Type   | Description                |   Default    |
| :--------- | :------: | :------------------------- | :----------: |
| caseServer | _string_ | The URL of the CAS server. | _(required)_ |

Additionally, there are some more configuration options:

| Name            |              Type               | Description                                                                                                                                                                                                                                                                                                               |   Default    |
| :-------------- | :-----------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------: |
| cas_version     | _"1.0"\|"2.0\|"3.0"\|"saml1.1"_ | The CAS protocol version.                                                                                                                                                                                                                                                                                                 |   _"3.0"_    |
| renew           |            _boolean_            | If true, an unauthenticated client will be required to login to the CAS system regardless of whether a single sign-on session exists.                                                                                                                                                                                     |   _false_    |
| is_dev_mode     |            _boolean_            | If true, no CAS authentication will be used and the session CAS variable will be set to whatever user is specified as _dev_mode_user_.                                                                                                                                                                                    |   _false_    |
| dev_mode_user   |            _string_             | The CAS user to use if dev mode is active.                                                                                                                                                                                                                                                                                |     _""_     |
| dev_mode_info   |            _Object_             | The CAS user information to use if dev mode is active.                                                                                                                                                                                                                                                                    |     _{}_     |
| session_name    |            _string_             | The name of the session variable that will store the CAS user once they are authenticated.                                                                                                                                                                                                                                | _"cas_user"_ |
| session_info    |            _string_             | The name of the session variable that will store the CAS user information once they are authenticated. If set to false (or something that evaluates as false), the additional information supplied by the CAS will not be forwarded. This will not work with CAS 1.0, as it does not support additional user information. |   _false_    |
| destroy_session |            _boolean_            | If true, the logout function will destroy the entire session upon CAS logout. Otherwise, it will only delete the session variable storing the CAS user.                                                                                                                                                                   |   _false_    |

## Provided middleware functions

### Negotiating CAS login/logout

It provides some middleware functions for controlling access to routes:

- `startSession`: start a CAS session (you must already have a valid CAS ticket)
- `returnTargetUrl`: return the target URL back to the frontend, so the frontend can then perform a redirect to this target URL (this time backed by a valid CAS authenticated session)
- `possibleCasLogout`: do a logout (does nothing at the moment)
- `redirectToFrontend`: redirects to the frontend
- `logout`: De-authenticates the client with the Express server and then redirects them to the CAS logout page.

### Access control

- `bounce`: Redirects an unauthenticated client to the CAS login page and then back to the requested page.
- `block`: Completely denies access to an unauthenticated client and returns a 401 response.
- `bounce_redirect`: Acts just like `bounce` but once the client is authenticated they will be redirected to the provided _returnTo_ query parameter.

## Usage

```javascript
const cas = require("cas-authentication-middleware").init({
  casServer: config.cas.server
});

// add CAS routes
router.get("/cas/login", cas.casLogin);
// return the target URL back to the frontend, so the frontend can then perform a redirect to
// this target URL (this time backed by a valid CAS authenticated session)
router.get("/cas/startSession", cas.startSession, cas.returnTargetUrl);
router.post("/cas", cas.possibleCasLogout, function(req, res) {
  res.send("nothing else to do");
});
router.get("/cas", cas.redirectToFrontend);

// application routes
router.get("/someData", cas.block, someData.getAll); // resource protected by cas.block
```
