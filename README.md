This example demonstrates how to use [Express](http://expressjs.com/) 4.x and
[Passport](http://passportjs.org/) to authenticate users using a username and
password with [form-based authentication](https://en.wikipedia.org/wiki/HTTP%2BHTML_form-based_authentication).
Use this example as a starting point for your own web applications.

## Instructions

To install this example on your computer, clone the repository and install
dependencies.

```bash
$ git clone git@github.com:passport/express-4.x-local-example.git
$ cd express-4.x-local-example
$ npm install
```

Start the server.

```bash
$ node server.js
```

Open a web browser and navigate to [http://localhost:3000/](http://127.0.0.1:3000/)
to see the example in action.  Log in using username `jack` and password `secret`.

<a target='_blank' rel='nofollow' href='https://app.codesponsor.io/link/vK9dyjRnnWsMzzJTQ57fRJpH/passport/express-4.x-local-example'>  <img alt='Sponsor' width='888' height='68' src='https://app.codesponsor.io/embed/vK9dyjRnnWsMzzJTQ57fRJpH/passport/express-4.x-local-example.svg' /></a>



## RUN

### var env
```
APP_URL=  Application base url
GITHUB_CLIENT_ID=   GitHub client id
GITHUB_CLIENT_SECRET=   GitHub client secret
KEYCLOAK_HOST= Keycloak base url
KEYCLOAK_REALM= Keycloak realm
KEYCLOAK_CLIENT_ID= Keycloak client id
KEYCLOAK_CLIENT_SECRET= Keycloak client secret
CAS_CLIENT_ID= CAS client id
CAS_CLIENT_SECRET= CAS client secret
CAS_DISCOVERY_URI= CAS service discovery url
```

### command
```
npm start
```