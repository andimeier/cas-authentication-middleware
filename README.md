# Express CAS Middleware

This is a CAS authentication library designed to be used as middleware in an Express server.

The use case is a Node Express app which delivers the backend (the "API") as well as the frontend (the "client"),
where the backend and client are protected resources. The client routes will be equipped with an automatic CAS cycle in case
there is no active session.

## Installation

    npm install --save cas-authentication-middleware

## Basic setup

The setup consists of 3 steps:

1. include lib and initialize it
2. _after_ a session middleware, "use" this CAS authentication middleware
3. add the `casHandler` middleware function to the routes delivering the client

### Include lib and initialize it

The only initialization parameter is the URL of the CAS server:

```javascript
const cas = require("cas-authentication-middleware").init({
  casServer: "http://cas.server.url"
});
```

### Use CAS authentication middleware

Use the following line in your Express server to include the CAS middleware:

```javascript
app.use("/cas", cas.casRouter);
```

Note, that this middleware relies on a session middleware already set up and put _before_ the CAS middleware, so be sure to "use" your session middleware before.

By adding the CAS middleware, the CAS routes are installed. These routes are needed as endpoints for login, validating CAS tickets etc.
It basically provides all the infrastructure for executing the CAS cycle.

### Add `casHandler` to protect client

The `casHandler` is a middleware function protecting the client. It will ensure that there is a valid user session when the client is loaded. If not, the CAS cycle is initiated.
After successful CAS login, you will be redirected to the URL requested in the first place - this time backed by a valid session.

So, when the client is started, the CAS authentication has already been done.

```javascript
router.use(
  "/client",
  cas.casHandler,
  express.static(path.resolve(path.dirname(require.main.filename), "client"))
);
```

## Options

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

## Internal information

You don't neeed this information to use this CAS middleware. It just documents what is "under the hood".

### Provided middleware functions

#### Negotiating CAS login/logout

It provides some middleware functions for controlling access to routes:

- `startSession`: start a CAS session (you must already have a valid CAS ticket)
- `returnTargetUrl`: return the target URL back to the frontend, so the frontend can then perform a redirect to this target URL (this time backed by a valid CAS authenticated session)
- `possibleCasLogout`: do a logout (does nothing at the moment)
- `redirectToFrontend`: redirects to the frontend
- `logout`: De-authenticates the client with the Express server and then redirects them to the CAS logout page.

#### Access control

- `bounce`: Redirects an unauthenticated client to the CAS login page and then back to the requested page.
- `block`: Completely denies access to an unauthenticated client and returns a 401 response.
- `bounce_redirect`: Acts just like `bounce` but once the client is authenticated they will be redirected to the provided _returnTo_ query parameter.
