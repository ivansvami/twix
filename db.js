const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI не задан в переменных окружения (.env)');
    process.exit(1);
  }
  try {
    await mongoose.connect(uri);
    console.log('MongoDB подключена');
  } catch (err) {
    console.error('Ошибка подключения к MongoDB:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
