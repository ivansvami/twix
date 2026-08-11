const mongoose = require('mongoose');

const suggestedVideoSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true },
  youtubeId: { type: String, required: true },
  category: {
    type: String,
    enum: ['Смешные', 'Трукрайм', 'Разоблачения', 'Трейлеры', 'Разное'],
    default: 'Разное'
  },
  comment: { type: String, trim: true, maxlength: 150, default: '' },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SuggestedVideo', suggestedVideoSchema);
