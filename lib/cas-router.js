"use strict";
const router = require("express").Router({ mergeParams: true });
const casHelpers = require("./cas-helper-functions");

// add CAS routes
router.get("/login", casHelpers.casLogin);
router.get(
  "/validate",
  casHelpers.startSession,
  //users.registerLogin,
  casHelpers.redirectToTarget
);
router.post("/", casHelpers.possibleCasLogout, function(req, res) {
  res.send("nothing else to do");
});
router.get("/", casHelpers.redirectToFrontend);

// router.get("/cas/toTarget", casHelpers.block, casHelpers.redirectToTarget);

//router.get('/login', auth.login); // FIXME debugging function
router.get("/logout", casHelpers.logout);
//router.get("/loggedIn", auth.ensureSession);

module.exports = router;
