const mongoose = require('mongoose');
const crypto = require('crypto');

const postSchema = new mongoose.Schema({
  title: String,
  description: String,
  videoUrl: String,
  imageUrl: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  views: { type: Number, default: 0 },
  viewedBy: [String],
  
  // Добавляем shortId с генерацией 7 уникальных символов:
  shortId: { 
    type: String, 
    unique: true, 
    default: () => crypto.randomBytes(4).toString('hex').slice(0, 7) 
  },
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Post', postSchema);