const mongoose = require('mongoose');
module.exports = mongoose.model('Message', new mongoose.Schema({
  sender: String,
  receiver: String,
  content: String,
  isGroup: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
}));