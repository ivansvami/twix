const mongoose = require('mongoose');

const postViewSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  ipHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 180 } // авто-очистка через 180 дней
});

// Один и тот же IP не может создать больше одной записи просмотра для одного поста
postViewSchema.index({ post: 1, ipHash: 1 }, { unique: true });

module.exports = mongoose.model('PostView', postViewSchema);
