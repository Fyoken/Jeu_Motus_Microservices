// Import necessary modules
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const redis = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
// Initialize Redis client
const redisClient = redis.createClient({
  url:REDIS_URL
});
(async () => {
    await redisClient.connect();
})();

redisClient.on('connect', () => console.log('Redis Client Connected'));
redisClient.on('error', (err) => console.log('Redis Client Connection Error', err));
const app = express();
app.use(express.static('public'));
app.use(express.json()); // Middleware to parse JSON bodies
// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Configure session middleware
app.use(session({
  secret: '764135795148620584328965',
  resave: true,
  saveUninitialized: true,
}));

// Function to generate a random code
function generateRandomCode() {
  // Generate a random string of characters (e.g., alphanumeric)
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const codeLength = 10;
  let code = '';
  
  for (let i = 0; i < codeLength; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return code;
}

// Middleware to set the username in the session
const setUsernameInSession = (req, res, next) => {
  if (req.session.user) {
    // If the user is already logged in, set the username in the session
    res.locals.username = req.session.user;
  }
  next();
};

// Apply the middleware globally
app.use(setUsernameInSession);

// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.redirect("/login");
  }
};

// Route for displaying session content
app.get('/session', requireLogin, (req, res) => {
  res.json(req.session);
});

function validateAuthorizationParams(clientId, scope, redirectUri) {
    const validClientIds = ['76413579514862058'];
    const validScopes = ['openid'];
    const validRedirectUris = ['http://localhost:8080/callback'];

    return validClientIds.includes(clientId) && validScopes.includes(scope) && validRedirectUris.includes(redirectUri);
}

async function validateCredentials(username, password) {
    // Assuming you have a Redis database with user credentials stored
    const hashedPassword = await redisClient.hGet('users', username);
    if (hashedPassword === null) {
        return false; // Username not found
    }
    // Compare hashed password
    const inputHashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    return hashedPassword === inputHashedPassword;
}


// Route to handle authorization request
app.get('/authorize', (req, res) => {
  const { client_id, scope, redirect_uri } = req.query;
  if (validateAuthorizationParams(clientId, scope, redirectUri)) {
    // Display login form
    res.sendFile(__dirname + '/public/login.html');
  } else {
    res.send("Unauthorized.");
  } 
});

const jwt = require('jsonwebtoken');

async function validateCodeAndRetrieveClientLogin(code) {
    return await redisClient.hGet("session", code);
}

// Route to exchange code for token
app.post('/token', async (req, res) => {
  const { code } = req.body;

  try {
    // Validate the code and retrieve client login
    const clientLogin = await validateCodeAndRetrieveClientLogin(code);

    if (clientLogin) {
      // Generate JWT token
      const token = jwt.sign({ username: clientLogin }, '764135795148620584328965');

      res.json({ token });
    } else {
      res.status(400).send('Invalid code');
    }
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    res.status(500).send('Internal server error');
  }
});


// Route to handle login form submission
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  redirect_uri = "http://localhost:8080/callback";
  const validCredentials = await validateCredentials(username, password);
  if (validCredentials) {
    // Generate a random code
    const code = generateRandomCode();

    await redisClient.hSet("session", code, username);

    // Redirect to redirect_uri with code parameter
    res.redirect(`${redirect_uri}?code=${code}`);
  } else {
    res.status(401).send('Invalid username or password');
  }
});


// Route for main page
app.get('/', (req, res) => {
  if (req.session.user) {
    res.send(`Welcome to the main page, ${req.session.user}!`);
  } else {
    res.redirect("/login");
  }
});


app.post('/register', async (req, res) => {
  const { username, password, confirm_password } = req.body;

  // Check if all fields are provided
  if (!username || !password || !confirm_password) {
    return res.status(400).send("All fields are required");
  }

  // Check if passwords match
  if (password !== confirm_password) {
    return res.status(400).send("Passwords do not match");
  }

  try {
    // Hash the password before storing
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    const pass = await redisClient.hGet('users', username);

    if (pass !== undefined && pass !== null) {
      return res.status(400).send("Username already exists"); // Send error message if username already exists
    } else {
      // No data found for the given username, indicating that the username doesn't exist
      // Store hashed password in Redis
      redisClient.hSet('users', username, hashedPassword, (err) => {
        if (err) {
          console.error('Redis error:', err);
          reject('Internal server error');
          return;
        }
        resolve();
        });
      // Redirect to motus microservice with session information
      res.redirect(`http://localhost:3012`);
      }
     } catch (error) {
    return res.status(500).send(error);
  }
});


// Route for logging in
app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

// Route for registering
app.get('/register', (req, res) => {
  res.sendFile(__dirname + '/public/register.html');
});

// Start the server
const PORT = process.env.PORT || 3012;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

