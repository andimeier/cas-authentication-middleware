"use strict";
var express = require("express");
const session = require("express-session");

const CAS_SERVER = "http://localhost:3003";

const authCas = require("../index.js").init({
  casServer: CAS_SERVER
});

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

app.use("/", (req, res, next) => {
  console.log("\n\n");
  console.log(`---- APP ----> incoming request: ${req.originalUrl}`);
  next();
});

app.use("/cas", authCas.casRouter);
//app.use(authCas.casHandler);

// the "client app" which will be called only when authentication has been done
app.get("/client", authCas.casHandler, function(req, res) {
  res.render("index", {
    title: "Hey",
    message: `Hello there, ${req.session.userId}!`
  });
});

app.listen(port);
console.log(`Listening on port ${port} ...`);
