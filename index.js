const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
console.log('Ticketmaster API Key:', process.env.TICKETMASTER_API_KEY);

const mongoose = require('mongoose');
const Search = require('./models/Search'); 

const bcrypt = require('bcrypt');
const User = require('./models/User'); // new


const app = express();
const PORT = 5050;

const WEATHER_API_KEY = 'eb15f8ab4e356d62dd84027c18eff998';
const GEMINI_API_KEY = 'AIzaSyAkhsuohEMZ1-1Nf9nwU1zKikmvnCRmUzY';


app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));


app.get('/weather', async (req, res) => {
  const { city, userId, skipSave } = req.query;

  try {
    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${WEATHER_API_KEY}&units=metric`
    );

    let searchEntry = null;

    
    if (skipSave !== 'true') {
  const weather = response.data;
  searchEntry = new Search({
    city,
    userId,
    temp: weather.main.temp,
    condition: weather.weather[0].main,
    description: weather.weather[0].description,
    humidity: weather.main.humidity,
    wind: weather.wind.speed,
    country: weather.sys.country,
    playlistWeatherKey: weather.weather[0].main,
  });
  await searchEntry.save();
}


    res.json({
      weather: response.data,
      searchId: searchEntry ? searchEntry._id : null
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Weather API error' });
  }
});


app.get('/', (req, res) => {
  res.json({ 
    message: 'Weather API Server is running!',
    endpoints: {
      weather: '/weather?city=CITY_NAME&userId=USER_ID',
      events: '/events?lat=LAT&lon=LON&date=YYYY-MM-DD',
      history: '/history?userId=USER_ID',
      register: 'POST /register',
      login: 'POST /login',
      aiSuggestion: 'POST /ai-suggestion'
    }
  });
});

// AI Suggestion Route
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

app.post('/ai-suggestion', async (req, res) => {
  const { temp, condition, city } = req.body;

  const prompt = `
You are an outfit and activity recommendation assistant. Based on this weather data, suggest a creative and smart idea.

City: ${city}
Temperature: ${temp}°C
Condition: ${condition}

Respond with a short, engaging paragraph that suggests both an outfit and an activity.
`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    await Search.findByIdAndUpdate(req.body.searchId, {
  suggestion: text
});


    res.json({ suggestion: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gemini API error' });
  }
});

app.post('/history', async (req, res) => {
  const { city, userId } = req.body;

  if (!city || !userId) {
    return res.status(400).json({ error: 'City and userId are required' });
  }

  try {
    // Check if user already searched this city
    const exists = await Search.findOne({ city, userId });

    if (!exists) {
      await new Search({ city, userId }).save();
    }

    res.json({ message: 'Saved to history' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save history' });
  }
});


// Register
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  try {
    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ error: 'Username already exists' });

    const newUser = new User({ username, password });
    await newUser.save();
    res.json({ message: 'Registered successfully', userId: newUser._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Incorrect username or password' });
    }

    res.json({ message: 'Login successful', userId: user._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error during login' });
  }
});


app.get('/history', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const history = await Search.find({ userId }).sort({ date: -1 }).limit(10);
    res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error fetching user history' });
  }
});


app.delete('/history/all', async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    await Search.deleteMany({ userId });
    res.json({ message: 'All searches deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete all searches' });
  }
});


app.delete('/history/:id', async (req, res) => {
  try {
    await Search.findByIdAndDelete(req.params.id);
    res.json({ message: 'Search deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete search' });
  }
});





app.get('/events', async (req, res) => {
  const { lat, lon, date } = req.query;

  if (!lat || !lon || !date) {
    return res.status(400).json({ error: 'lat, lon, and date are required' });
  }

  try {
    const startDateTime = `${date}T00:00:00Z`;
    const endDateTime = `${date}T23:59:59Z`;


    const response = await axios.get(
      'https://app.ticketmaster.com/discovery/v2/events.json',
      {
        params: {
          apikey: process.env.TICKETMASTER_API_KEY,
          latlong: `${lat},${lon}`,
          startDateTime,
          endDateTime,
          radius: 50,
          unit: 'km',
          locale: '*'
        }
      }
    );

    const events = response.data._embedded?.events || [];
    res.json({ events });
  } catch (err) {
    console.error('Ticketmaster API error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Ticketmaster API error' });
  }
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
