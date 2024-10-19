const express = require('express');
const redis = require('redis');
const app = express();
const os = require('os');
app.use(express.static('public'));
app.use(express.json()); // Middleware to parse JSON bodies
// Middleware to parse JSON bodies
app.use(express.json());

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Initialize Redis client
const client = redis.createClient({ url: REDIS_URL });

(async () => {
    await client.connect();
})();

client.on('connect', () => console.log('Redis Client Connected'));
client.on('error', (err) => console.log('Redis Client Connection Error', err));

const REDIS_URL2 = 'redis://redisAuth:6379';
// Initialize Redis client
const redisClient = redis.createClient({
  url:REDIS_URL2
});
(async () => {
    await redisClient.connect();
})();

redisClient.on('connect', () => console.log('Redis Client Connected'));
redisClient.on('error', (err) => console.log('Redis Client Connection Error', err));

// Define endpoint to record player score
app.post('/setscore', async (req, res) => {
    const { username, tries } = req.body;

    // Get existing score from Redis or initialize to default values
    let scores = await client.hGet('scores', username);
    if (!scores) {
        scores = JSON.stringify({ wordsFound: 0, averageTry: 0 });
    }

    // Parse the existing score
    const { wordsFound, averageTry } = JSON.parse(scores);

    // Update the score based on the new tries
    const updatedWordsFound = wordsFound + 1;
    const updatedAverageTry = ((wordsFound * averageTry) + parseInt(tries)) / updatedWordsFound;

    // Store updated score in Redis
    client.hSet('scores', username, JSON.stringify({"wordsFound": updatedWordsFound, "averageTry": updatedAverageTry}), (err) => {
        if (err) {
            res.status(500).send('Error recording score');
        } else {
            res.status(200).send('Score recorded successfully');
        }
    });
});


// Define endpoint to retrieve player score
app.get('/getscore', async (req, res) => {
    const { username } = req.query;
    // Get player score from Redis
    const score = await client.hGet('scores', username);
    if (!score) {
      return res.status(404).send('Player score not found');
    } else {
      const { wordsFound, averageTry } = JSON.parse(score);
      return res.status(200).json({ wordsFound, averageTry });
    }
});

// Endpoint to serve score.html
app.get('/score', async (req, res) => {
    res.sendFile(__dirname + `/public/score.html`);
});

app.get('/test', (req, res) => {
    res.sendFile(__dirname + '/public/test.html');
});

const port = process.env.PORT || 3012;
app.listen(port, () => {
    console.log(`Score tracking API running on port ${port}`);
});

// Endpoint to return server information
app.get('/port', (req, res) => {
    const hostname = os.hostname();
    res.send(`SCORING APP working on ${hostname} port ${port}`);
});
