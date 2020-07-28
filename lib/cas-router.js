"use strict";
const router = require("express").Router({ mergeParams: true });
const casHelpers = require("./cas-helper-functions");

// add CAS routes
// casLogin redirects the user to the cas server, except when devmode is enabled
// it then calls next() and for that there is the redirectToFrontend
router.get("/login", casHelpers.casLogin, casHelpers.redirectToFrontend);
router.get(
  "/validate",
  casHelpers.startSession,
  casHelpers.redirectToFrontend
);
router.post("/", casHelpers.possibleCasLogout, function(req, res) {
  res.sendStatus(204);
});
router.get("/", casHelpers.redirectToFrontend);
router.get("/logout", casHelpers.logout);

module.exports = router;
