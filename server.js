const express = require("express");
const passport = require("passport");
const Strategy = require("passport-local").Strategy;
const GitHubStrategy = require("passport-github").Strategy;
const OIDC = require('openid-client');

const db = require("./db");
const assert = require("assert");

const KeycloakStrategy = require("@exlinc/keycloak-passport");

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
    db.users.findByUsername(username, function(err, user) {
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

  let casIssuer = await OIDC.Issuer.discover(process.env.CAS_DISCOVERY_URI); // => Promise

console.log(casIssuer.issuer, casIssuer.metadata);

  const client = new casIssuer.Client({
    client_id: process.env.CAS_CLIENT_ID,
    client_secret: process.env.CAS_CLIENT_SECRET,
    redirect_uris: [`http://localhost:3000/login/unikname-cas/cb`],
    response_types: ['code']
  });

  const params = {
    scope: 'openid profile email phone displayName'
  }

  passport.use('oidc', new OIDC.Strategy({ client: client, params: params }, (tokenset, userinfo, done) => {
    // console.log('tokenset', tokenset);
    // console.log('access_token', tokenset.access_token);
    // console.log('id_token', tokenset.id_token);
    // console.log('claims', tokenset.claims);
    console.log('userinfo', userinfo);
    if (userinfo) {
      user = {
        id: userinfo.id,
        username: userinfo.sub,
        displayName: ''
      };
      db.users.createUserIfNeeded(user, () => {
        done(null, user);
      });
    }
  }));
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

app.get('/login/unikname-cas', passport.authenticate('oidc'));

// authentication callback
app.get('/login/unikname-cas/cb', passport.authenticate('oidc'), function(//{ successRedirect: '/', failureRedirect: '/login' }));
  req,
  res) {
    res.redirect("/");
  });


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

app.listen("3000", "localhost");
