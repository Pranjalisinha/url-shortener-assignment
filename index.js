require('babel-polyfill');

// import path from 'path';
const express = require("express")
const bodyParser = require("body-parser")
const cookieParser = require("cookie-parse")
const csrf = require("csurf");
const moment = require("moment");

const isURL = require("./src/utils/URL")

const PORT = process.env.PORT || 3000;

const DB = require("./src/db/index")

const app = express();
// app.set('view engine', 'ejs');
// app.set('views', path.join(__dirname, '/views'));
const csrfProtection = csrf({ cookie: true });
// app.use(cookieParser);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// error handling for token
app.use(function(err, req, res, next) {
  if (err.code !== 'EBADCSRFTOKEN') return next(err);

  // handle CSRF token errors here
  res.status(403);
  res.send('form tampered with');
});

let initialVars = {
  // true if new url was saved
  success: false,
  // url if new url is saved
  urlSaved: '',
  // alias if new url is saved
  aliasSaved: '',
  // errors
  // general error
  error: false,
  errorMessage: '',
  // error for url
  errorUrl: false,
  // error for alias
  errorAlias: false,
  // form url
  url: '',
  // form alias
  alias: ''
};

// create new url
app.post('/', csrfProtection, async (req, res) => {
  let vars = { ...initialVars, csrfToken: req.csrfToken() };

  // check for proper submitted url
  if (!req.body.url || !isURL(req.body.url)) {
    vars.errorUrl = true;
  }

  // if alias is sent, check if it contains only letters number and hyphen
  if (req.body.alias && !/^[aA-zZ0-9-]+$/g.test(req.body.alias)) {
    vars.errorAlias = true;
  }

  // process url and create new short url if no errors
  if (!vars.errorUrl && !vars.errorAlias) {
    const addUrl = await db.addUrl(req.body.url, req.body.alias);
    if (addUrl.error) {
      vars.error = true;
      vars.errorMessage = addUrl.error;
    } else if (addUrl.success) {
      // successfully added url
      vars.success = true;
      vars.urlSaved = req.body.url;
      vars.aliasSaved =
        req.protocol + '://' + req.headers.host + '/' + addUrl.alias;
    }
  }

  // return results if any error is detected
  if (vars.error || vars.errorUrl || vars.errorAlias) {
    // assign previous values so user can correct errors
    vars.url = req.body.url;
    vars.alias = req.body.alias;
  }

  // render the page
  renderHome(req, res, vars);
});

// serve index page
app.get('/', csrfProtection, async (req, res) => {
  renderHome(req, res, { ...initialVars, csrfToken: req.csrfToken() });
});

// serve any other url as redirection possibility
app.get('*', csrfProtection, async (req, res) => {
  if (!req.params['0']) {
    // if alias is incorrect then send error message
    renderHome(req, res, {
      ...initialVars,
      csrfToken: req.csrfToken(),
      error: true,
      errorMessage: 'Invalid alias specified, cannot redirect to URL'
    });
  }

  const url = await db.getUrlFromAlias(req.params['0'].substr(1));
  if (url.error) {
    res.render('home', {
      ...initialVars,
      csrfToken: req.csrfToken(),
      error: true,
      errorMessage: url.error
    });
  } else {
    res.redirect(url.url);
  }
});

const renderHome = async (req, res, data) => {
  // get latest and most viewed
  const latest = await db.getLatest();
  const mostViewed = await db.getMostViewed();

  // console.log('latest', latest.length);
  // console.log('mostViewed', mostViewed.length);
  const baseUrl = req.protocol + '://' + req.headers.host + '/';

  data.latest = latest.map(url => ({
    alias: '/' + url.alias,
    redirect: baseUrl + url.alias,
    url: url.url,
    visits: url.visits,
    createdAt: moment(url.createdAt).fromNow()
  }));
  data.mostViewed = mostViewed.map(url => ({
    alias: '/' + url.alias,
    redirect: baseUrl + url.alias,
    url: url.url,
    visits: url.visits,
    createdAt: moment(url.createdAt).fromNow()
  }));

  res.render('home', data);
};

let db;

async function startApp() {
  try {
    db = await new DB(process.env.DATABASE_URL);
    await db.init();
  } catch (error) {
    console.log('ERROR ESTABLISHING DATABASE CONNECTION');
  }

  app.listen(PORT);
  console.log(`Listening on ${PORT}`);
}

startApp();