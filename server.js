require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const connectDB = require('./config/db');
const { loadUser } = require('./middleware/auth');

const app = express(); 

// === ВСТАВЛЯТЬ СЮДА (Редирект на HTTPS для Render) ===
app.set("trust proxy", 1);

app.use((req, res, next) => {
  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    return next();
  }
  return res.redirect(301, `https://${req.headers.host}${req.url}`);
});
// ====================================================

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
const PORT = process.env.PORT || 3000;

connectDB();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change_me_please',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 }
}));

app.use(loadUser);

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/twitchAuth'));
app.use('/', require('./routes/posts'));
app.use('/', require('./routes/comments'));
app.use('/', require('./routes/notifications'));

app.use((req, res) => {
  res.status(404).render('404');
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
