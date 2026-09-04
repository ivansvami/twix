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
const PORT = process.env.PORT || 3000;

// Render (и большинство хостингов) работают через обратный прокси —
// без этого req.ip будет показывать внутренний IP прокси, а не реальный IP посетителя
app.set('trust proxy', 1);

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Не удалось подключиться к MongoDB перед запросом:', err.message);
    res.status(503).send('Сервис временно недоступен, попробуйте обновить страницу через несколько секунд.');
  }
});

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
  // Раньше здесь был mongoUrl — connect-mongo сам открывал ВТОРОЕ подключение
  // к MongoDB в дополнение к mongoose, и на холодном старте оба подключения
  // (два TLS+auth рукопожатия к Atlas) складывались в задержку 3-4 секунды.
  // clientPromise переиспользует уже установленное (и закэшированное между
  // тёплыми вызовами) соединение mongoose — теперь рукопожатие одно, а не два.
  store: MongoStore.create({ clientPromise: connectDB.getClient() }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

app.use(loadUser);

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/twitchAuth'));
app.use('/', require('./routes/posts'));
app.use('/', require('./routes/comments'));
app.use('/', require('./routes/notifications'));
app.use('/', require('./routes/suggestedVideos'));

app.use((req, res) => {
  res.status(404).render('404');
});

app.use((err, req, res, next) => {
  console.error('Unhandled request error:', err);
  if (res.headersSent) return next(err);

  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ ok: false, error: 'Внутренняя ошибка сервера' });
  }

  res.status(500).send('Внутренняя ошибка сервера');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
  });
}

module.exports = app;
