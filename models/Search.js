const mongoose = require('mongoose');

const SearchSchema = new mongoose.Schema({
  city: String,
  suggestion: String,
  weather: Object,
  date: { type: Date, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
  temp: Number,
  condition: String,
  description: String,
  humidity: Number,
  wind: Number,
  country: String,
  playlistWeatherKey: String,
});

module.exports = mongoose.model('Search', SearchSchema);
