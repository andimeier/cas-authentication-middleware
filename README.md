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

This lib will throw an error if no session object is found!

### Include lib and initialize it

The only initialization parameters are the URL of the CAS server and explicitly setting the backendBaseUrl to `false`:

```javascript
const cas = require("cas-authentication-middleware").init({
  casServer: "http://cas.server.url",
  backendBaseUrl: false
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

| Name      |   Type   | Description                |
| :-------- | :------: | :------------------------- |
| casServer | `string` | The URL of the CAS server. |
| backendBaseUrl | `string` \| `false` | Necessary for node servers behind a reverse proxy which might manipulate the path so that the request at the node server does not know the correct entire path - we would not be able to reconstruct the absolute path for the redirect back to the client (target). So, this setting is necessary when the app sits behind a reverse proxy. Otherwise set it to `false` to tell the middleware that we are not behind a reverse proxy. |

Additionally, there are some more configuration options:

| Name | Type | Default | Description |
| :--- | :--: | :-----: | :---------- |
| logger | `function` | `null` | A logging function. If set, all logging output will be sent to this function. If omitted, stdout will be used. The log message will contain a marker indicating the severity (in the log message itself). |
| cas_version | `"1.0" | "2.0" | "3.0" | "saml1.1"` | `"2.0"` | The CAS protocol version. |
| renew | `boolean` | `false` | If true, an unauthenticated client will be required to login to the CAS system regardless of whether a single sign-on session exists. |
| devMode | `boolean` | `false` | If true, no CAS authentication will be used and the session CAS variable will be set to whatever user is specified as `devModeUser`. |
| devModeUser | `string` | `""` | The CAS user to use if dev mode is active. |
| devModeInfo | `Object` | `{}` | The CAS user information to use if dev mode is active. |
| sessionName | `string` | `"userId"` | The name of the session variable that will store the CAS user once they are authenticated. |
| sessionInfo | `string` | `"cas_userinfo"` | The name of the session variable that will store the CAS user information once they are authenticated. If set to false (or something that evaluates as false), the additional information supplied by the CAS will not be forwarded. This will not work with CAS 1.0, as it does not support additional user information. |
| destroy_session | `boolean` | `false` | If true, the logout function will destroy the entire session upon CAS logout. Otherwise, it will only delete the session variable storing the CAS user. |
| checkUser | `(username: string) => Promise<string|object>` | `null` | This function is called to verify that the user is permitted by the application after they have authenticated. It is passed the username provided by the CAS server and it should return the user object, which will be stored in the `user` variable in the session. On an error or when the user is not authorized, it should return a string with the corresponding message. |
| onUnauthorizedUser | `(req: Express.Request, res: Express.Response, username: string, err: any) => boolean` | `null` | This function is called when the user was not auhtorized (the `checkUser` function rejected). It is passed the [`Express.Request`](https://expressjs.com/en/4x/api.html#req) object to access the session, the [`Express.Response`](https://expressjs.com/en/4x/api.html#res) object to send a custom response, the username from the CAS server and the error. If it returns `true`, the middleware passes on to the next request handler |
| casRouterPrefix | `string` | `/cas` | The full path where the cas router is mounted. Used to redirect to the login url. Don't forget to mount the router! |
| frontend_url | `string` | `null` | The URL to redirect to when no target url was given in query parameters. Typically the url to the frontend |

## Dev mode

In development phase, it can be desirable to short-circuit the CAS mechanism. This can be done by setting the options `devMode` and `devModeUser`. 
If these options are provided, then no CAS login will take place. Instead, the specified "dev user" will be used to populate a valid session with.

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
- `getSessionInfo`: retrieve session info about the logged in user: it consists of { userId, userInfo }. `userId` is the username used with the CAS login,
  `userInfo` are any additional attributes the CAS login process provided about the user (this is an optional CAS feature)
- `ensureSession`: express endpoint function which ensures there is a valid session. If there is none, a CAS cycle will be done. This should only be relevant in 
  dev mode because with dev mode switched off, the scenario would be that the client would only be delivered when the CAS auth middleware has set up a 
  session. So the situation where we need `ensureSession` would not occur.

#### Access control

- `block`: Completely denies access to an unauthenticated client and returns a 401 response.
- `bounce_redirect`: Redirects an unauthenticated client to the CAS login page and then back to the provided _returnTo_ query parameter.

## Demo

The included demo server shows the basic usage.

### Start

Start the demo server with

    npm run demo

This will launch a server listening on port 3017.

In the browser, try to load the client with:

    http://localhost:3017/client

This should trigger the CAS login (note that a CAS server has to be present for this).
After successful login, the client page is displayed, displaying the logged in user.
