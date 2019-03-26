const express = require("express");
const passport = require("passport");
const Strategy = require("passport-local").Strategy;
const GitHubStrategy = require("passport-github").Strategy;
const OIDC = require("openid-client");

const db = require("./db");
const assert = require("assert");

const MongoClient = require("mongodb").MongoClient;
const KeycloakStrategy = require("@exlinc/keycloak-passport");

require("custom-env").env("dev");

// Assert env variables
assert(process.env.APP_URL, "process.env.APP_URL missing");
assert(process.env.GITHUB_CLIENT_ID, "process.env.GITHUB_CLIENT_ID missing");
assert(
  process.env.GITHUB_CLIENT_SECRET,
  "process.env.GITHUB_CLIENT_SECRET missing"
);
assert(process.env.KEYCLOAK_HOST, "process.env.KEYCLOAK_HOST missing");
assert(process.env.KEYCLOAK_REALM, "process.env.KEYCLOAK_REALM missing");
assert(
  process.env.KEYCLOAK_CLIENT_ID,
  "process.env.KEYCLOAK_CLIENT_ID missing"
);
assert(
  process.env.KEYCLOAK_CLIENT_SECRET,
  "process.env.KEYCLOAK_CLIENT_SECRET missing"
);

assert(process.env.MONGO_URL, "process.env.MONGO_URL missing");
assert(process.env.MONGO_DB_NAME, "process.env.MONGO_DB_NAME missing");

let database = null;
MongoClient.connect(`mongodb://${process.env.MONGO_URL}`, function(
  error,
  client
) {
  if (error) return funcCallback(error);
  database = client.db(process.env.MONGO_DB_NAME);
  console.log("Connecté à la base de données 'UnikNameUsers'");
});

// For self signed certificates
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

// Configure the local strategy for use by Passport.
//
// The local strategy require a `verify` function which receives the credentials
// (`username` and `password`) submitted by the user.  The function must verify
// that the password is correct and then invoke `cb` with a user object, which
// will be set at `req.user` in route handlers after authentication.
passport.use(
  new Strategy(function(username, password, cb) {
    db.users.findById(username, function(err, user) {
      if (err) {
        return cb(err);
      }
      if (!user) {
        return cb(null, false);
      }
      if (user.password != password) {
        return cb(null, false);
      }
      return cb(null, user);
    });
  })
);

// GitHub
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: `${process.env.APP_URL}/login/github/callback`
    },
    function(accessToken, refreshToken, profile, cb) {
      let user;
      if (profile) {
        user = {
          id: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          emails: profile.emails
        };
      }
      db.users.createUserIfNeeded(user, () => {
        cb(null, user);
      });
    }
  )
);

// Keycloak
passport.use(
  "keycloak",
  new KeycloakStrategy(
    {
      host: process.env.KEYCLOAK_HOST,
      realm: process.env.KEYCLOAK_REALM,
      clientID: process.env.KEYCLOAK_CLIENT_ID,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
      callbackURL: `${process.env.APP_URL}/login/unikname/callback`,
      authorizationURL: `${process.env.KEYCLOAK_HOST}/auth/realms/${
        process.env.KEYCLOAK_REALM
      }/protocol/openid-connect/auth`,
      tokenURL: `${process.env.KEYCLOAK_HOST}/auth/realms/${
        process.env.KEYCLOAK_REALM
      }/protocol/openid-connect/token`,
      userInfoURL: `${process.env.KEYCLOAK_HOST}/auth/realms/${
        process.env.KEYCLOAK_REALM
      }/protocol/openid-connect/userinfo`
    },
    (accessToken, refreshToken, profile, done) => {
      // This is called after a successful authentication has been completed
      // Here's a sample of what you can then do, i.e., write the user to your DB
      if (profile) {
        user = {
          id: profile.keycloakId,
          username: profile.username,
          displayName: profile.fullName,
          emails: [{ value: profile.email }]
        };
        db.users.createUserIfNeeded(user, () => {
          done(null, user);
        });
      }
    }
  )
);

(async function addOIDCStrategy() {
  let casIssuer = await OIDC.Issuer.discover(
    process.env.CAS_SIMPLE_DISCOVERY_URI
  ); // => Promise

  //console.log(casIssuer.issuer, casIssuer.metadata);

  const client = new casIssuer.Client({
    client_id: process.env.CAS_SIMPLE_CLIENT_ID,
    client_secret: process.env.CAS_SIMPLE_CLIENT_SECRET,
    redirect_uris: [`${process.env.APP_URL}/login/unikname-cas/cb`],
    response_types: ["code"]
  });

  const params = {
    scope: "openid"
  };

  passport.use(
    "oidc",
    new OIDC.Strategy(
      { client: client, params: params },
      (tokenset, userinfo, done) => {
        // console.log('tokenset', tokenset);
        // console.log('access_token', tokenset.access_token);
        // console.log('id_token', tokenset.id_token);
        // console.log('claims', tokenset.claims);
        console.log("userinfo", userinfo);
        if (userinfo) {
          user = {
            id: userinfo.id,
            username: userinfo.sub,
            displayName: ""
          };
          db.users.createUserIfNeeded(user, () => {
            done(null, user);
          });
        }
      }
    )
  );
})();

(async function addOIDCDelegatedStrategy() {
  let casIssuer = await OIDC.Issuer.discover(
    process.env.CAS_DELEGATE_DISCOVERY_URI
  ); // => Promise

  //console.log(casIssuer.issuer, casIssuer.metadata);

  const client = new casIssuer.Client({
    client_id: process.env.CAS_DELEGATE_CLIENT_ID,
    client_secret: process.env.CAS_DELEGATE_CLIENT_SECRET,
    redirect_uris: [`${process.env.APP_URL}/login/unikname-cas-delegate/cb`],
    response_types: ["code"]
  });

  const params = {
    scope: "openid"
  };

  passport.use(
    "oidc-delegate",
    new OIDC.Strategy(
      { client: client, params: params },
      (tokenset, userinfo, done) => {
        console.log("userinfo", userinfo);
        if (userinfo) {
          user = {
            id: userinfo.id,
            username: userinfo.sub,
            displayName: ""
          };
          db.users.createUserIfNeeded(user, () => {
            done(null, user);
          });
        }
      }
    )
  );
})();

(async function addOIDC_U2FStrategy() {
  let casIssuer = await OIDC.Issuer.discover(process.env.CAS_U2F_DISCOVERY_URI); // => Promise

  const client = new casIssuer.Client({
    client_id: process.env.CAS_U2F_CLIENT_ID,
    client_secret: process.env.CAS_U2F_CLIENT_SECRET,
    redirect_uris: [`${process.env.APP_URL}/login/unikname-cas-u2f/cb`],
    response_types: ["code"]
  });

  const params = {
    scope: "openid"
  };

  passport.use(
    "oidc-u2f",
    new OIDC.Strategy(
      { client: client, params: params },
      (tokenset, userinfo, done) => {
        console.log("userinfo", userinfo);
        if (userinfo) {
          user = {
            id: userinfo.id,
            username: userinfo.sub,
            displayName: ""
          };
          db.users.createUserIfNeeded(user, () => {
            done(null, user);
          });
        }
      }
    )
  );
})();

(async function addOIDC_PWDLESSStrategy() {
  let casIssuer = await OIDC.Issuer.discover(
    process.env.CAS_PWDLESS_DISCOVERY_URI
  ); // => Promise

  const client = new casIssuer.Client({
    client_id: process.env.CAS_PWDLESS_CLIENT_ID,
    client_secret: process.env.CAS_PWDLESS_CLIENT_SECRET,
    redirect_uris: [`${process.env.APP_URL}/login/unikname-cas-pwdless/cb`],
    response_types: ["code"]
  });

  const params = {
    scope: "openid"
  };

  passport.use(
    "oidc-pwdless",
    new OIDC.Strategy(
      { client: client, params: params },
      (tokenset, userinfo, done) => {
        console.log("userinfo", userinfo);
        if (userinfo) {
          user = {
            id: userinfo.id,
            username: userinfo.sub,
            displayName: ""
          };
          db.users.createUserIfNeeded(user, () => {
            done(null, user);
          });
        }
      }
    )
  );
})();

(async function addOIDC_GAStrategy() {
  let casIssuer = await OIDC.Issuer.discover(process.env.CAS_GA_DISCOVERY_URI); // => Promise

  const client = new casIssuer.Client({
    client_id: process.env.CAS_GA_CLIENT_ID,
    client_secret: process.env.CAS_GA_CLIENT_SECRET,
    redirect_uris: [`${process.env.APP_URL}/login/unikname-cas-ga/cb`],
    response_types: ["code"]
  });

  const params = {
    scope: "openid"
  };

  passport.use(
    "oidc-ga",
    new OIDC.Strategy(
      { client: client, params: params },
      (tokenset, userinfo, done) => {
        console.log("userinfo", userinfo);
        if (userinfo) {
          user = {
            id: userinfo.id,
            username: userinfo.sub,
            displayName: ""
          };
          db.users.createUserIfNeeded(user, () => {
            done(null, user);
          });
        }
      }
    )
  );
})();

(async function addOIDC_PassphraseStrategy() {
  let casIssuer = await OIDC.Issuer.discover(
    process.env.CAS_PASSPHRASE_DISCOVERY_URI
  ); // => Promise

  const client = new casIssuer.Client({
    client_id: process.env.CAS_PASSPHRASE_CLIENT_ID,
    client_secret: process.env.CAS_PASSPHRASE_CLIENT_SECRET,
    redirect_uris: [`${process.env.APP_URL}/login/unikname-cas-passphrase/cb`],
    response_types: ["code"]
  });

  const params = {
    scope: "email"
  };

  passport.use(
    "oidc-passphrase",
    new OIDC.Strategy(
      { client: client, params: params },
      (tokenset, userinfo, done) => {
        console.log("userinfo", userinfo);
        if (userinfo) {
          user = {
            id: userinfo.id,
            username: userinfo.sub,
            displayName: ""
          };
          db.users.createUserIfNeeded(user, () => {
            done(null, user);
          });
        }
      }
    )
  );
})();

// Configure Passport authenticated session persistence.
//
// In order to restore authentication state across HTTP requests, Passport needs
// to serialize users into and deserialize users out of the session.  The
// typical implementation of this is as simple as supplying the user ID when
// serializing, and querying the user record by ID from the database when
// deserializing.
passport.serializeUser(function(user, cb) {
  cb(null, user.id);
});

passport.deserializeUser(function(id, cb) {
  db.users.findById(id, function(err, user) {
    if (err) {
      return cb(err);
    }
    console.log("USER FROM DB !!!!!!!!!!!!!!", user);
    cb(null, user);
  });
});

// Create a new Express application.
var app = express();

// Configure view engine to render EJS templates.
app.set("views", __dirname + "/views");
app.set("view engine", "ejs");

// Use application-level middleware for common functionality, including
// logging, parsing, and session handling.
app.use(require("morgan")("combined"));
app.use(require("cookie-parser")());
app.use(require("body-parser").urlencoded({ extended: true }));
app.use(
  require("express-session")({
    secret: "keyboard cat",
    resave: false,
    saveUninitialized: false
  })
);

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// Initialize Passport and restore authentication state, if any, from the
// session.
app.use(passport.initialize());
app.use(passport.session());

// Define routes.
app.get("/", function(req, res) {
  res.render("home", { user: req.user });
});

app.get("/login", function(req, res) {
  res.render("login");
});

app.post(
  "/login",
  passport.authenticate("local", { failureRedirect: "/login" }),
  function(req, res) {
    res.redirect("/");
  }
);

app.get("/create", function(req, res) {
  res.render("create");
});

app.post("/create", function(req, res) {
  var newUser = {
    username: req.body.username,
    password: req.body.password,
    phone: req.body.phone,
    email: req.body.email,
    first_name: req.body.firstName,
    last_name: req.body.lastName
  };

  database.collection("users").insert(newUser, null, function(error, results) {
    if (error) throw error;

    console.log("Le document a bien été inséré");
    res.redirect("/");
  });
});

app.get("/login/github", passport.authenticate("github"));

app.get(
  "/login/github/callback",
  passport.authenticate("github", { failureRedirect: "/login" }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect("/");
  }
);

app.get("/login/unikname", passport.authenticate("keycloak"));
app.get("/login/unikname/callback", passport.authenticate("keycloak"), function(
  req,
  res
) {
  // Successful authentication, redirect home.
  res.redirect("/");
});

app.get("/login/unikname-cas", passport.authenticate("oidc"));

// authentication callback
app.get("/login/unikname-cas/cb", passport.authenticate("oidc"), function(
  //{ successRedirect: '/', failureRedirect: '/login' }));
  req,
  res
) {
  res.redirect("/");
});

app.get("/login/unikname-cas-delegate", passport.authenticate("oidc-delegate"));

// authentication callback
app.get(
  "/login/unikname-cas-delegate/cb",
  passport.authenticate("oidc-delegate"),
  function(
    //{ successRedirect: '/', failureRedirect: '/login' }));
    req,
    res
  ) {
    res.redirect("/");
  }
);

app.get("/login/unikname-cas-u2f", passport.authenticate("oidc-u2f"));

// authentication callback
app.get(
  "/login/unikname-cas-u2f/cb",
  passport.authenticate("oidc-u2f"),
  function(
    //{ successRedirect: '/', failureRedirect: '/login' }));
    req,
    res
  ) {
    res.redirect("/");
  }
);

app.get("/login/unikname-cas-pwdless", passport.authenticate("oidc-pwdless"));

// authentication callback
app.get(
  "/login/unikname-cas-pwdless/cb",
  passport.authenticate("oidc-pwdless"),
  function(
    //{ successRedirect: '/', failureRedirect: '/login' }));
    req,
    res
  ) {
    res.redirect("/");
  }
);

app.get("/login/unikname-cas-ga", passport.authenticate("oidc-ga"));

// authentication callback
app.get("/login/unikname-cas-ga/cb", passport.authenticate("oidc-ga"), function(
  //{ successRedirect: '/', failureRedirect: '/login' }));
  req,
  res
) {
  res.redirect("/");
});

app.get(
  "/login/unikname-cas-passphrase",
  passport.authenticate("oidc-passphrase")
);

// authentication callback
app.get(
  "/login/unikname-cas-passphrase/cb",
  passport.authenticate("oidc-passphrase"),
  function(
    //{ successRedirect: '/', failureRedirect: '/login' }));
    req,
    res
  ) {
    res.redirect("/");
  }
);

app.get("/logout", function(req, res) {
  req.logout();
  res.redirect("/");
});

app.get("/profile", require("connect-ensure-login").ensureLoggedIn(), function(
  req,
  res
) {
  res.render("profile", { user: req.user });
});

app.listen("3003", "localhost");
