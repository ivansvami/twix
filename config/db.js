const mongoose = require('mongoose');

// В serverless-окружении (Vercel) функция может запускаться заново на каждый
// запрос — без кэширования соединение с MongoDB создавалось бы каждый раз
// заново, а это самая частая причина медленной загрузки сайта на Vercel.
let cached = global._mongooseCache;
if (!cached) {
  cached = global._mongooseCache = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI не задан в переменных окружения (.env)');
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 8000,
        socketTimeoutMS: 20000,
        maxPoolSize: 10
      })
      .then((mongooseInstance) => {
        console.log('MongoDB подключена');
        return mongooseInstance;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Сбрасываем промис, чтобы следующий запрос мог попробовать подключиться заново,
    // а не был навсегда "заперт" в упавшем подключении
    cached.promise = null;
    console.error('Ошибка подключения к MongoDB:', err.message);
    throw err;
  }

  return cached.conn;
}

// Отдаёт нативный MongoClient той же самой (закэшированной) mongoose-сессии —
// нужно, чтобы connect-mongo (хранилище express-session) не открывал
// ВТОРОЕ отдельное подключение к базе на каждый холодный старт.
// Именно это удвоение подключений и было главной причиной долгого cold start.
async function getClient() {
  const conn = await connectDB();
  return conn.connection.getClient();
}

module.exports = connectDB;
module.exports.getClient = getClient;
