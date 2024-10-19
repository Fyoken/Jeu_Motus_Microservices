const os = require('os');
const request = require('request');
const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const app = express();
const fetch = require('node-fetch');
const redis = require('redis');
const prometheus = require('prom-client');
const http = require('http');
const loki_uri = process.env.LOKI || "http://127.0.0.1:3100";
const { createLogger, transports } = require("winston");
const LokiTransport = require("winston-loki");
const options = {
  transports: [
    new LokiTransport({
      host: loki_uri
    })
  ]
};

const logger = createLogger(options);

const REDIS_URL = 'redis://redisAuth:6379';
// Initialize Redis client
const redisClient = redis.createClient({
  url:REDIS_URL
});
(async () => {
    await redisClient.connect();
})();

redisClient.on('connect', () => console.log('Redis Client Connected'));
redisClient.on('error', (err) => console.log('Redis Client Connection Error', err));
const register = prometheus.register;

app.use(express.static('public'));
app.use(express.json()); // Middleware to parse JSON bodies

// Create custom metrics
const httpRequestCounter = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

const loginCounter = new prometheus.Counter({
  name: 'login_total',
  help: 'Total number of successful logins',
});

// Register custom metrics
register.registerMetric(httpRequestCounter);
register.registerMetric(loginCounter);

const server = http.createServer((req, res) => {
  httpRequestCounter++;
  console.log(req.url);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  var data = `http_requests_total{hostname="${hostname}"} ${httpRequestCounter}
rand ${loginCounter}`
  logger.info({ message: 'URL '+req.url , labels: { 'url': req.url ,'app':'motus'} })
  logger.warn({ message: 'Stats ', labels: { 'login_total': loginCounter, "http_requests_total":httpRequestCounter ,'stats':'motus'} })
  res.end(data);
});

// Example route for HTTP requests
app.use((req, res, next) => {
  // Increment the HTTP request counter
  httpRequestCounter.labels(req.method, req.path, res.statusCode).inc();
  next();
});

// Use cookie-parser middleware
app.use(cookieParser());
let seed = generateRandomNumber(); // Initial seed value

let remainingTries = 6; // Variable to keep track of remaining tries

// Read the word list from the file
const wordList = fs.readFileSync('./data/liste_francais_utf8.txt', 'utf-8').split('\n');
// Define route to get the word for the day
app.get('/list', (req, res) => {
    res.send(wordList); // Send the word as response
});
// Generate a random number based on the current date
function generateRandomNumber() {
    const date = new Date().toISOString().split('T')[0]; // Get the current date in YYYY-MM-DD format
    const hash = crypto.createHash('sha256').update(date).digest('hex'); // Hash the date using SHA-256
    const randomNumber = parseInt(hash.substring(0, 8), 16); // Convert the first 8 characters of the hash to an integer
    return randomNumber;
}

// Configure session middleware
app.use(session({
  secret: '764135795148620584328965',
  resave: true,
  saveUninitialized: true
}));

async function exchangeCodeForToken(code) {
    try {
        const response = await fetch('http://microservices_auth_1:3001/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code })
        });
        if (!response.ok) {
            throw new Error('Failed to exchange code for token');
        }
        const data = await response.json();
        return data.token;
    } catch (error) {
        console.error('Error exchanging code for token:', error);
        throw error;
    }
}


const jwt = require('jsonwebtoken');

// Callback route to handle token response
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  try {
    // Exchange code for token
    const token = await exchangeCodeForToken(code);
    // Parse the JWT token
    const decoded = jwt.verify(token, '764135795148620584328965');

    if (decoded && decoded.username) {
      // Set the user in the session
      req.session.user = decoded.username;

      // Combine session ID and username into a single value
      const sessionIdAndUsername = `${req.session.id}:${decoded.username}`;

      // Set a cookie with the combined value
      res.cookie('session', sessionIdAndUsername, { maxAge: 900000, httpOnly: true }); // Example cookie with a 15-minute expiration time

      // Log the session ID and username for verification
      console.log(`Session ID: ${req.session.id}, Username: ${req.session.user}`);
      loginCounter.inc();
    } else {
      console.error('Invalid token or missing username claim.');
      throw new Error('Invalid token or missing username claim.');
    }

    // Redirect to main page or any other desired route
    res.redirect('/');
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    res.status(500).send('Error exchanging code for token.');
  }
});


// Route to check if user is logged in and redirect to auth server if not
app.get('/', (req, res) => {
  if (!req.session.user) {
    // Redirect to the auth server for authorization
    const clientId = '76413579514862058';
    const scope = 'openid';
    const redirectUri = 'http://localhost:8080/callback';
    res.redirect(`http://localhost:3012/authorize?client_id=${clientId}&scope=${scope}&redirect_uri=${redirectUri}`);
    logger.info('User redirected to authentication server');
  } else {
    // User is logged in, proceed with normal operations
    res.send(`Welcome to the main page, ${req.session.user}!`);
    logger.info(`User ${req.session.user} accessed the main page`);
  }
});

// Route to handle logout
app.get('/logout', (req, res) => {
  // Clear the session and cookie
  req.session.destroy();
  res.clearCookie('username');
  res.redirect('/');
});

// Route to get the username from Redis
app.get('/username', async (req, res) => {
  try {
    // Get the session ID from the request
    const sessionId = req.session.id;
    
    // Retrieve the username associated with the session ID
    const username = req.session.user;

    logger.info('User logged out');

    // Respond with the username
    res.status(200).send(username);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('An error occurred while retrieving the username.');
    logger.info('An error occurred while retrieving the username.');
  }
});


// Define route to get the word for the day
app.get('/word', (req, res) => {
    const index = seed % wordList.length; // Calculate the index using modulo with current seed
    const word = wordList[index]; // Get the word corresponding to the index
    res.send(word); // Send the word as response
});

// Define route to verify the guess
app.get('/guess', async (req, res) => {
    const username = req.session.user;
    const guess = req.query.guess.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const actualWord = req.query.word.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const correctLetters = actualWord.split('').filter((letter, index) => letter === guess[index]).length;

    if (correctLetters === actualWord.length) {
        if (username && username !== undefined) {
          await putScoreInDatabase(username, 7 - remainingTries);
        }
        res.send({ message: "Correct guess" });
    } else {
        remainingTries--;
        res.send({ message: "Incorrect guess" });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    // Respond with a simple message or status code indicating the health of the server
    res.status(200).send('Server is healthy');
});

// API endpoint to change the seed value
app.post('/seed', (req, res) => {
    const { newSeed } = req.body;
    seed = parseInt(newSeed);
    res.send(`Seed value changed to ${newSeed}`);
});

const port = process.env.PORT || 3001;

// Endpoint to return server information
app.get('/port', (req, res) => {
    const hostname = os.hostname();
    res.send(`MOTUS APP working on ${hostname} port ${port}`);
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
});


const putScoreInDatabase = async function(username, score) {
    try {
        // Construct the request body as a JSON object
        const requestBody = {
            username: username,
            tries: score
        };

        // Send a POST request to /setscore endpoint
        const response = await fetch('http://microservices_score_1:3001/setscore', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error('Failed to put score in the database');
        }
        return 'Score successfully recorded in the database';
    } catch (error) {
        console.error('Error:', error);
        return 'An error occurred while saving the score.';
    }
};

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

