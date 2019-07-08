"use strict";
var express = require("express");
const session = require("express-session");

const authCas = require("../index.js");

const port = 3017;

var app = express();
app.set("view engine", "pug"); // for the demo

// Set up an Express session, which is required for CASAuthentication.
app.use(
  session({
    secret: "$#6%24agg$hhhJHJ55",
    resave: false,
    saveUninitialized: true
  })
);

//app.use(authCas);

// the "client app" which will be called only when authentication has been done
app.get("/client", function(req, res) {
  res.render("index", {
    title: "Hey",
    message: `Hello there, ${req.session.userId}!`
  });
});

app.listen(port);
console.log(`Listening on port ${port} ...`);
