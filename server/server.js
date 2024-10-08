const express = require('express');
const bodyParser = require('body-parser');
const cassandra = require('cassandra-driver');
const uuid = require('uuid');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const sizeof = require('object-sizeof');



let secrets;
try {
  const secretsRaw = fs.readFileSync('secrets.json');
  secrets = JSON.parse(secretsRaw);
} catch (err) {
  console.error('Error reading secrets.json:', err);
  process.exit(1); // Exit the application if the secrets cannot be loaded
}
jwtSecret = secrets.JWT_SECRET;


const { createKeyspace, createUsersTable, createPostsTable, createCommentsTable, flushAllTables, dropAllTables, createVotesTable,createCategoriesTable,createDefaultCategories,createLinksTable,emptyCommentsTable,createMaterializedViews,insertFakeUsers,createPostIdCounterTable,createUserSavedPostsTable,createUserSavedCommentsTable,createUserEmailsTable,createPinnedPostsTable } = require('./db/db_create');
const { insertPostData, populateTestData, insertCommentData,generateCommentUUID,generateContentId,insertCategoryData,updateCommentData,tallyVotesForComment,deleteCommentData,generatePermalink,savePostForUser,saveCommentForUser,unsaveCommentForUser,insertOrUpdateVote } = require('./db/db_insert');
const { fetchPostByPostID, fetchPostsAndCalculateVotesAndCommentCounts, getCommentDetails,fetchCategoryByName,isPostOlderThanDays,isCacheValid } = require('./db/db_query');
const { validateComment, processHTMLFromUsers, validateUsername } = require('./utils/inputValidation');
const { generateCategoryPermalink,fetchURLAndParseForThumb,extractRelevantText } = require('./utils/util');
const { generateAIComment,generateSummary,moderateContent,checkCategoryRelevancy } = require('./utils/ai');
const { initializePosts,usernames } = require('./initData'); // Adjust the path as needed



const isMaster = process.argv.includes('master');

if (isMaster) {
    console.log('Running master');
} else {
    console.log('Running non-master');
}



const app = express();
const port = 80; // Use any port that suits your setup

app.set('trust proxy', true); // necessary when behind cloudflare even with just gray cloud
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, '..', 'public')));

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(bodyParser.urlencoded({ extended: true }));

// Parse JSON bodies (as sent by API clients)
app.use(express.json()); // This line is added to parse JSON request bodies

// Default Cache-Control for all responses
app.use((req, res, next) => {
  res.set('Cache-Control', 'public, max-age=0'); // default cache-control
  next();
});

// controls how long CF + browser cache content

function cacheDuration(seconds) {
  return function(req, res, next) {
      res.setHeader('Cache-Control', `public, max-age=${seconds}`);
      next();
  };
}



// Define a rate limit rule with a custom key generator
const getRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests, please try again later.',
  keyGenerator: (req /*, res*/) => {
    // Use the CF-Connecting-IP header to get the client's IP address
    return req.headers['cf-connecting-ip'] || req.ip;
  },
  handler: function (req, res /*, next*/) {
    // You can customize the status code and message here
    res.status(429).json({
      status: 'error',
      message: 'Too many requests, please try again later.'
    });
  },
});

app.get('/*', getRateLimiter);

// Define a rate limit rule with a custom key generator
let postLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 min
  max: 10, // limit each IP to 5 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests, please try again later.',
  keyGenerator: (req /*, res*/) => {
    // Use the CF-Connecting-IP header to get the client's IP address
    return req.headers['cf-connecting-ip'] || req.ip;
  },
  handler: function (req, res /*, next*/) {
    // You can customize the status code and message here
    res.status(429).json({
      status: 'error',
      message: 'Too many requests, please try again later.'
    });
  },
});

app.post('/*', postLimiter);








const client = new cassandra.Client({
  contactPoints: ['149.28.231.86', '45.77.101.209'],
  localDataCenter: 'datacenter1',
 // keyspace: 'azodu_keyspace',
  authProvider: new cassandra.auth.PlainTextAuthProvider('cassandra', secrets.CASSANDRA_PW)

});

const userTimeouts = {};



let postsCache = {};
let pinnedPostsCache = {}; 
const cache = {
  category: { 'ttl': 2 * 60 * 1000, 'permalinks': {}  },
  // You can add more categories here in the future, e.g., posts: {}, users: {}, etc.
};



// the following should probably be staggered if multiple servers are running
const UPDATE_VOTES_AND_PINNED_CACHE_INTERVAL = Math.floor(Math.random() * 51 + 10) * 1000; // how quickly to fetch all posts and update votes, random # between 10 and 50 sec

// following only happens on master
const COMMENT_GENERATION_INTERVAL_MS = 2 * 60000; // 2 min
const FREQUENCY_TO_CREATE_POSTS_FROM_EXTERNAL_FETCH = 60000 * 120; // 120 min


const fullPostsCache = new NodeCache({ stdTTL: 200, checkperiod: 120 });
const defaultCategories = ["anything","azodu"];
const loginExpires = 86400 * 30; // how long till login expires
const NUM_POSTS_BACK_CALCULATE_VOTES_COMMENTS = 150; // the # of posts to go back in a category on an interval to calculate votes and comments
const NUM_POSTS_CACHED = 2500; // num of posts to go back via api/posts. multiplies in memory for each category and each sort: latest/top/controversial
const COMMENT_POST_CHANCE = 1; // % chance of posting a comment on each post, 1 is 100%
const DAYS_TILL_CALCULATE_VOTES_AND_COMMENTS = 45; // WARNING default_time_to_live on votes table should be at least 1 day greater than this
const DAYS_TILL_VOTING_ALLOWED = 45; // should probably be the same as DAYS_TILL_CALCULATE_VOTES_AND_COMMENTS
const DAYS_TILL_ALLOWED_TO_COMMENT = 999999; 


// Dedicated blacklist for posts to skip commenting
const postsCommentBlacklist = {};


const onlyAnythingCategory = true; // Set to false to comment on all categories
if (isMaster) {
  setInterval(async () => {
    const now = new Date().getTime(); // Get current time in milliseconds
    const categories = onlyAnythingCategory ? ['anything'] : Object.keys(postsCache); // Determine which categories to process
    // etCacheSize();

    categories.forEach(async (category) => {
      if (postsCache[category] && Object.keys(postsCache[category]).length > 0) {
        // Convert postIds into an array of objects with postId and its weight based on timestamp
        const weightedPosts = Object.keys(postsCache[category])
          .filter(id => !postsCommentBlacklist[id])
          .map(id => {
            const postAgeHours = (now - new Date(postsCache[category][id].timestamp).getTime()) / (1000 * 60 * 60); // Calculate post age in hours
            const weight = 1 / (postAgeHours + 1); // Add 1 to avoid division by zero and invert age to weight
            return { id, weight };
          });

        // Calculate total weight
        const totalWeight = weightedPosts.reduce((acc, { weight }) => acc + weight, 0);

        // Choose a postId based on weights
        let accumulator = 0;
        const random = Math.random() * totalWeight;
        const postId = weightedPosts.find(({ weight }) => (accumulator += weight) >= random)?.id;

        if (postId && Math.random() <= COMMENT_POST_CHANCE && postsCache[category][postId].ai_summary /* && parseInt(postsCache[category][postId].comment_count) < 11 */) {
          const post = postsCache[category][postId];
          const model = "gpt-3.5-turbo";
          const comment = await generateAIComment(post.title, post.ai_summary, model, postId);
          //   console.log('created comment for ' + post.title);

          if (comment == null || comment == 'null') {
            postsCommentBlacklist[postId] = true; // Mark the post in the dedicated blacklist
            return;
          }

          const generatedCommentId = generateContentId(); // Generate a unique comment ID
          const timestamp = new Date();
          const randomIndex = Math.floor(Math.random() * usernames.length);
          const author = usernames[randomIndex]; // Randomly picked author from the array

          await insertCommentData(client, generatedCommentId, postId, author, postId, "text", comment, 0, 0, `${post.permalink}`, timestamp);


          // Add random upvotes
          const min = -1, max = 6, randomUpvotes = Math.floor(Math.random() * (max - min + 1)) + min;
          const randomIP = (Math.floor(Math.random() * 1000000)).toString(); // Generate random IP for voting
          await insertOrUpdateVote(client, generatedCommentId, randomUpvotes, randomIP); // Adding votes

          await tallyVotesForComment(client, postId, generatedCommentId);




        }
      }
    });
  }, COMMENT_GENERATION_INTERVAL_MS);
}




// Assume we have a global set to store processed titles
let processedTitles = new Set();

async function fetchFromExternalAndCreatePosts() {
  try {
    const urls = [
      'https://old.reddit.com/r/news/top/.json',
      //   'https://old.reddit.com/r/worldnews/top/.json',
      'https://old.reddit.com/r/technology/top/.json',
      'https://old.reddit.com/r/nottheonion/.json',
      'https://old.reddit.com/r/conservative/.json'

    ];

    // Select a random URL from the array
    const randomUrl = urls[Math.floor(Math.random() * urls.length)];

    // Fetch data from the randomly selected URL
    const response = await axios.get(randomUrl);

    const posts = response.data.data.children;

    let postsDone = 0;
    for (let post of posts) {
      let { title, permalink, url, author, post_hint, subreddit } = post.data;

      // Conditional logic for r/Conservative subreddit to only process 'link' post_hints
      if (subreddit.toLowerCase() === 'conservative' && post_hint !== 'link') {
        continue; // Skip non-link posts from r/Conservative
      }

      if (url.includes('reddit.com') || url.includes('redd.it'))
        continue;

      // Skip processing if the title has already been processed
      if (processedTitles.has(title) || processedTitles.has(url)) {
        continue;
      }

      if (title.toLowerCase().includes('trump'))
        continue;

      if (postsDone > 0) break; // Process only one post for demonstration
      postsDone++;

      // pick a random author
      const randomIndex = Math.floor(Math.random() * usernames.length);
      author = usernames[randomIndex];


      const checkQuery = 'SELECT link FROM azodu_keyspace.links WHERE link = ? AND category = ?';
      const checkResult = await client.execute(checkQuery, [url, 'anything'], { prepare: true });

      if (checkResult.rowLength === 0) {
        // Process new post
        const thumbnail = await fetchURLAndParseForThumb(url);

        let summary = "";
        try {
          const { data } = await axios.get(url);
          const extractedText = extractRelevantText(data);
          summary = await generateSummary(extractedText);
          if (extractedText.length < 1) summary = undefined;
        } catch (fetchError) {
          console.error('Error fetching URL content or generating summary from: ' + url);
        }

        const result = await insertPostData(client, title, author, 'anything', 'url', url, thumbnail, summary, false);
        processedTitles.add(title); // Prevent future reposts of the same title

        // Add random upvotes
        const min = -1, max = 5, randomUpvotes = Math.floor(Math.random() * (max - min + 1)) + min;
        const randomIP = (Math.floor(Math.random() * 1000000)).toString(); // Generate random IP for voting
        await insertOrUpdateVote(client, result.postID, randomUpvotes, randomIP); // Adding votes



      } else {
        processedTitles.add(url); // Skip posts already in the database
        console.log('URL in links table, adding to ignore list: ' + url);
      }
    }

    if (postsDone === 0) {
      console.log('No new titles to process. All fetched titles have already been taken.');
    }
  } catch (error) {
    console.error('Failed to fetch from Reddit or insert posts:', error);
  }
}


if (isMaster) {
  setInterval(fetchFromExternalAndCreatePosts, FREQUENCY_TO_CREATE_POSTS_FROM_EXTERNAL_FETCH);
}




let currentCategoryIndex = 0; // To keep track of the current category being processed

async function processCategoriesPeriodically() {
  setInterval(async () => {
    const categoryKeys = Object.keys(cache.category.permalinks);
    if (categoryKeys.length === 0) return;

    const currentCategory = categoryKeys[currentCategoryIndex];
    try {
      const newSummary = await fetchPostsAndCalculateVotesAndCommentCounts(client, currentCategory, postsCache[currentCategory] ? postsCache[currentCategory] : {}, true, NUM_POSTS_BACK_CALCULATE_VOTES_COMMENTS,DAYS_TILL_CALCULATE_VOTES_AND_COMMENTS);
      updatePinnedPostsInCache(newSummary, currentCategory);
      // You may want to consider whether you need to keep this assignment or adjust the design
      // to better handle updates.
      postsCache[currentCategory] = newSummary;
    } catch (error) {
      console.error(`Failed to process votes for category: ${currentCategory}`, error);
    }

    // Update index for next iteration
    currentCategoryIndex = (currentCategoryIndex + 1) % categoryKeys.length;
  }, UPDATE_VOTES_AND_PINNED_CACHE_INTERVAL);
}



const getCacheSize = () => {
  let totalSize = 0;
  const keys = fullPostsCache.keys(); // Get all keys stored in the cache

  for (const key of keys) {
    const value = fullPostsCache.get(key);
    const size = sizeof(value); // Calculate the size of each cached item
    totalSize += size; // Sum up the total size
  }

  console.log(`Total Cache Size: ${totalSize} bytes`);
  return totalSize;
};



function updatePinnedPostsInCache(postsCache, category) {
  // Convert the object to an array of posts
  const posts = Object.values(postsCache);
  posts.forEach(post => {
    if (pinnedPostsCache[category] && pinnedPostsCache[category].some(p => p.post_id.toString() === post.post_id.toString())) {
      const index = pinnedPostsCache[category].findIndex(p => p.post_id.toString() === post.post_id.toString());
      if (index !== -1) {
        // Update the pinned post in the cache
        pinnedPostsCache[category][index] = {
          ...pinnedPostsCache[category][index],
          ...post
        };
      }
    }
  });
}





async function updatePinnedPostsCache(category) {
  try {
    const categories = [category]; // Dynamic categories as per your setup

    for (const category of categories) {
      const queryPinnedIds = 'SELECT post_id FROM azodu_keyspace.pinned_posts WHERE category = ? LIMIT 3';
      const resultPinnedIds = await client.execute(queryPinnedIds, [category], { prepare: true });
      const pinnedPostIds = resultPinnedIds.rows.map(row => row.post_id);

      const pinnedPostsDetails = await Promise.all(
        pinnedPostIds.map(async (post_id) => {
          const queryPostDetails = 'SELECT * FROM azodu_keyspace.posts WHERE category = ? AND post_id = ?';
          const resultPostDetails = await client.execute(queryPostDetails, [category, post_id], { prepare: true });
          return resultPostDetails.rows[0]; // Assuming each ID returns exactly one post
        })
      );

      pinnedPostsCache[category] = pinnedPostsDetails.filter(post => post).map(post => ({ ...post, isPinned: true }));
    }
  } catch (error) {
    console.error('Failed to update pinned posts cache:', error);
  }
}




// Function to calculate the next timeout duration
function getNextTimeoutDuration(previousDuration) {
  if (!previousDuration) return 2 * 60 * 1000; // 5 minutes for the first time
  return Math.min(previousDuration * 2, 24 * 60 * 60 * 1000); // Double each time but cap at 24 hours
}

// Function to check if the user is currently timed out
function checkTimeout(username) {
  const currentTime = Date.now();
  const userRecord = userTimeouts[username];
  if (userRecord && currentTime < userRecord.nextAllowedTime) {
    return Math.ceil((userRecord.nextAllowedTime - currentTime) / 1000); // Return remaining seconds
  }
  return null;
}

function setTimeoutForUser(username) {
  const currentTime = Date.now();
  const userRecord = userTimeouts[username];
  const nextDuration = getNextTimeoutDuration(userRecord ? userRecord.currentTimeoutDuration : null);
  userTimeouts[username] = {
    nextAllowedTime: currentTime + nextDuration,
    currentTimeoutDuration: nextDuration
  };
  return nextDuration; // Return the duration for immediate feedback
}



function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, jwtSecret, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user; // Assuming user payload has a 'username' field
    next();
  });
}





app.post('/api/register', async (req, res) => {
  const { username, password, email, recaptchaToken, honeypot } = req.body; // Include recaptchaToken in the body
  const clientIp = req.headers['cf-connecting-ip'] || req.ip;

  if (honeypot) {
    console.log('Honeypot field was triggered on register.');
    return res.status(400).json({ message: 'Spam detected.' });
  }




  // reCAPTCHA Verification
  const secretKey = secrets.RECAPTCHA_KEY; 
  try {
    const recaptchaResponse = await axios.post(`https://www.google.com/recaptcha/api/siteverify`, {}, {
      params: {
        secret: secretKey,
        response: recaptchaToken,
        remoteip: clientIp
      }
    });

    if (!recaptchaResponse.data.success || recaptchaResponse.data.score < 0.5) { // Consider a threshold score to determine a pass
      return res.status(403).json({ message: 'Failed reCAPTCHA verification.' });
    }
  } catch (error) {
    return res.status(500).json({ message: 'Error verifying reCAPTCHA.', error: error.toString() });
  }

  // Proceed with the existing registration logic if reCAPTCHA verification is successful
  if (!username || !password || !email) {
    return res.status(400).json({ message: 'Username, password, and email are required.' });
  }

  const hashedPassword = await bcrypt.hash(password, 8);
  const dateRegistered = new Date();

  try {
    const insertEmailQuery = `INSERT INTO azodu_keyspace.user_emails (email, username) VALUES (?, ?) IF NOT EXISTS;`;
    const emailInsertResult = await client.execute(insertEmailQuery, [email, username], { prepare: true });

    if (emailInsertResult && emailInsertResult.rows && emailInsertResult.rows[0] && !emailInsertResult.rows[0]['[applied]']) {
      return res.status(409).json({ message: 'Email already exists.' });
    }

    const insertUserQuery = `
      INSERT INTO azodu_keyspace.users (username, password, email, date_registered, last_ip)
      VALUES (?, ?, ?, ?, ?) IF NOT EXISTS;
    `;
    const userInsertResult = await client.execute(insertUserQuery, [username, hashedPassword, email, dateRegistered, clientIp], { prepare: true });

    if (userInsertResult && userInsertResult.rows && userInsertResult.rows[0] && !userInsertResult.rows[0]['[applied]']) {
      const deleteEmailQuery = `DELETE FROM azodu_keyspace.user_emails WHERE email = ?`;
      await client.execute(deleteEmailQuery, [email], { prepare: true });

      return res.status(409).json({ message: 'Username already exists.' });
    }

    const token = jwt.sign({ username: username }, jwtSecret, { expiresIn: loginExpires }); // Adjusted expiresIn
    res.status(201).json({ auth: true, token: token,username:username, message: 'User created successfully. Redirecting...' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error registering user.' });
  }
});






app.post('/api/login', async (req, res) => {
  const { username, password,honeypot } = req.body;
  const clientIp = req.headers['cf-connecting-ip'] || req.ip;

  if (honeypot) {
    console.log('Honeypot field was triggered on login.');
    return res.status(400).json({ message: 'Spam detected.' });
  }


  try {
    const queryUser = 'SELECT * FROM azodu_keyspace.users WHERE username = ?';
    const result = await client.execute(queryUser, [username], { prepare: true });

    if (result.rowLength > 0) {
      const user = result.first();
      const passwordIsValid = await bcrypt.compare(password, user.password);

      if (!passwordIsValid) {
        return res.status(401).json({ message: 'Incorrect password.' });
      }

      // Update last_ip field in the database
      const updateIpQuery = 'UPDATE azodu_keyspace.users SET last_ip = ? WHERE username = ?';
      await client.execute(updateIpQuery, [clientIp, username], { prepare: true });

      const token = jwt.sign({ username: user.username, roles: user.roles }, jwtSecret, { expiresIn: loginExpires });
      res.status(200).json({ auth: true, token: token, username: user.username,message: 'Login successful.' });
    } else {
      res.status(404).json({ message: 'No user found.' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in.' });
  }
});



app.post('/api/subscribe', authenticateToken, async (req, res) => {
  const { permalink } = req.body; // The permalink of the category to subscribe to
  const username = req.user.username; // Extracted from the JWT token

  try {
    // Add the permalink to the user's subscriptions if it's not already present
    const updateQuery = `
      UPDATE azodu_keyspace.users
      SET subscriptions = subscriptions + ?
      WHERE username = ?;
    `;
    await client.execute(updateQuery, [[permalink], username], { prepare: true });

    // Fetch the current number of subscribers
    const selectQuery = 'SELECT subscribers FROM azodu_keyspace.categories WHERE permalink = ?';
    const { rows } = await client.execute(selectQuery, [permalink], { prepare: true });
   // console.log(rows[0]); 
    // Assuming 'subscribers' can be undefined, default to 0
    const currentSubscribers = rows[0] ? rows[0].subscribers || 0 : 0;


    // Increment the subscribers
    const newSubscribers = currentSubscribers + 1;
    const updateQueryB = 'UPDATE azodu_keyspace.categories SET subscribers = ? WHERE permalink = ?';
    await client.execute(updateQueryB, [newSubscribers, permalink], { prepare: true });



    res.json({ message: 'Subscribed successfully.' });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ message: 'Error processing subscription.' });
  }
});


app.post('/api/unsubscribe', authenticateToken, async (req, res) => {
  const { permalink } = req.body; // The permalink of the category to unsubscribe from
  const username = req.user.username; // Extracted from the JWT token

  try {
    // Remove the permalink from the user's subscriptions
    const updateQuery = `
      UPDATE azodu_keyspace.users
      SET subscriptions = subscriptions - ?
      WHERE username = ?;
    `;
    await client.execute(updateQuery, [[permalink], username], { prepare: true });


    // Fetch the current number of subscribers
    const selectQuery = 'SELECT subscribers FROM azodu_keyspace.categories WHERE permalink = ?';
    const { rows } = await client.execute(selectQuery, [permalink], { prepare: true });

    // Assuming 'subscribers' can be undefined, default to 0
    const currentSubscribers = rows[0] ? rows[0].subscribers || 0 : 0;

    // Decrement the subscribers, ensuring it doesn't go below 0
    const newSubscribers = Math.max(currentSubscribers - 1, 0);
    const updateQueryB = 'UPDATE azodu_keyspace.categories SET subscribers = ? WHERE permalink = ?';
    await client.execute(updateQueryB, [newSubscribers, permalink], { prepare: true });


    res.json({ message: 'Unsubscribed successfully.' });
  } catch (error) {
    console.error('Unsubscription error:', error);
    res.status(500).json({ message: 'Error processing unsubscription.' });
  }
});


async function getTwitterEmbedCode(url) {
  return `<blockquote class="twitter-tweet" data-theme="dark"><a href="${url}"></a></blockquote>`;
}

function isImageURL(url) {
  // Checks for image extensions occurring before any query parameters
  return /\.(jpg|jpeg|png|webp|gif|bmp|tiff)(\?.*)?$/i.test(url);
}


app.post('/submitPost', authenticateToken, async (req, res) => {
  const creator = req.user.username;
  let { title, category, postType, contentText, contentUrl,postID,isEdit } = req.body;

  // Check if user is currently timed out
  const timeoutSeconds = checkTimeout(creator);
  if (timeoutSeconds) {
    return res.status(429).json({
      status: 'error',
      message: `You must wait ${timeoutSeconds} more seconds before submitting again.`,
      error: true
    });
  }



  if (category == 'azodu') {
    const roles = req.user.roles || [];

    const hasPermission = roles.length > 0 && roles.includes('admin') || roles.includes('super_admin');
    if (!hasPermission) {
      return res.status(400).json({
        status: 'error',
        message: 'Only admins can post in c/azodu. Try posting in c/anything instead.',
        error: true
      });
    }
    
  }




  if (!isEdit) {

    // Validate title length for both post types
    if (title.length < 10 || title.length > 150) {
      return res.status(400).json({
        status: 'error',
        message: 'Title must be between 10 and 150 characters.',
        error: true
      });
    }
    
  }

  // Initialize variables
  let content = postType === 'text' ? contentText : contentUrl;
  let thumbnail = null;
  let summary = ""; // Initialize summary variable

  // Validate content length based on post type
  if (postType === 'text') {
    if (contentText.length < 30 || contentText.length > 50000) {
      return res.status(400).json({
        status: 'error',
        message: 'Content must be between 30 and 50000 characters for text posts.',
        error: true
      });
    }
  } else if (postType === 'url') {
    if (!contentUrl || contentUrl.length < 10 || contentUrl.length > 1000) {
      return res.status(400).json({
        status: 'error',
        message: 'Content URL must be between 10 and 1000 characters for URL posts.',
        error: true
      });
    }
  }

  title = processHTMLFromUsers(title);


  if (postType === 'text') {
    content = processHTMLFromUsers(contentText);

    const result = validateComment(content);
    if (!result.isValid) {
      return res.status(400).json({ status: 'error', message: 'Failed to submit post. Reason: ' + result.message, error: true });
    }

    const isContentSafe = await moderateContent(content, title, creator);
    console.log("Is content safe?", isContentSafe);
    if (!isContentSafe) {
      const nextTimeoutDuration = setTimeoutForUser(creator);

      return res.status(400).json({ status: 'error', message: `Your post was not approved because it was found by AI to be against our content policies. Wait ${nextTimeoutDuration / 1000} seconds before you can submit again. If you believe the AI made a mistake, please email info@azodu.com with the full contents of the post.` });
    }


  } else if (postType === 'url' && contentUrl && isImageURL(contentUrl)) { // direct link to image

    summary = '<img style="max-width: 100%;" src=' + contentUrl + ' />';
    thumbnail = contentUrl; 
    
   
    
  } else if (postType === 'url' && contentUrl) {
    thumbnail = await fetchURLAndParseForThumb(contentUrl);

    if (contentUrl.includes('x.com') || contentUrl.includes('twitter.com')) {

      summary = await getTwitterEmbedCode(contentUrl);
      title += ' [twitter]';

    }  else {
      try {
        // Fetch content from the URL
        const { data } = await axios.get(contentUrl);
        // Extract relevant text to summarize (this step may vary based on content)
        const extractedText = extractRelevantText(data); // Implement this function based on your needs

        if (extractedText.length > 10) {
          // Generate a summary of the extracted text
          summary = await generateSummary(extractedText);
        
        } else {
          summary = ''; 
        }
      } catch (fetchError) {
        console.error('Error fetching URL content for: ' + contentUrl);
        //  return res.status(500).json({ message: 'Failed to fetch URL content' });
      }
    }
  }

  // Fetch category description from cache or handle cache miss
  let categoryDescription = "";
  if (cache.category.permalinks[category] && cache.category.permalinks[category].data) {
    categoryDescription = cache.category.permalinks[category].data.description;
  } else {
    // Fallback: Fetch from database if not in cache (not shown here, implementation depends on your setup)
    // categoryDescription = await fetchCategoryDescriptionFromDB(category);
    console.log("Cache miss: category description not found in cache."); // Log for debugging
  }


  if (!isEdit) {
    let relevancyScore = await checkCategoryRelevancy(title, content, category, categoryDescription, summary, postType);
    if (relevancyScore < 30) {
      const nextTimeoutDuration = setTimeoutForUser(creator);

      return res.status(400).json({
        status: 'error',
        message: `Post is not relevant to the selected category. Wait ${nextTimeoutDuration / 1000} seconds before submitting again.`
      });

    }
  }
  console.log('category is ' + category); 
  try {
    const postDetails = await insertPostData(client, title, creator, category, postType, content, thumbnail, summary,undefined,isEdit? postID : null,isEdit);
    res.status(200).json({
      message: 'Success! You will be redirected to your new post ...',
      summary: summary,
      post_id: postDetails.post_id,  // Assuming insertPostData returns an object with post_id
      permalink: postDetails.permalink  // Assuming insertPostData returns an object with permalink
    });
  } catch (error) {
    res.status(500).json({ message: '' + error, error: true });
  }

});


function getAzoCostForCategory(permalink) {
  const baseCost = 0; // Base cost in Azo
  const minLength = 3;  // Minimum length for a category name
  const maxLength = 147; // Maximum length for a category name
  const length = Math.max(minLength, Math.min(permalink.length, maxLength));

  // Inverse proportionality: the shorter the name, the higher the cost
  return Math.ceil(baseCost * (maxLength / length));
}



app.post('/submitCategory', authenticateToken, async (req, res) => {
  const creator = req.user.username;
  const { name, permalinkFromClient, description, additional_info } = req.body;
  const permalink = generateCategoryPermalink(permalinkFromClient);
  const azoCost = getAzoCostForCategory(permalink);

  // Fetch user's current Azo balance
  const userResult = await client.execute('SELECT azo_spent FROM azodu_keyspace.users WHERE username = ?', [creator], { prepare: true });
  const user = userResult.rows[0];
  const totalAzoEarned = await calculateAzoForUser(creator);

  const azoBalance = totalAzoEarned - user.azo_spent;



  // Deduct the Azo cost from user's balance
  const newAzoSpent = user.azo_spent + azoCost;
  await client.execute('UPDATE azodu_keyspace.users SET azo_spent = ? WHERE username = ?', [newAzoSpent, creator], { prepare: true });



  // Validate category description length
  if (description.length < 25 || description.length > 175) {
    return res.status(400).json({
      error: true,
      message: 'Category description must be between 25 and 175 characters.'
    });
  }

  // Validate additional information length
  if (additional_info.length > 1000) {
    return res.status(400).json({
      error: true,
      message: 'Additional information must not exceed 1000 characters.'
    });
  }

  try {
    const permalinkCheckQuery = 'SELECT permalink, creator FROM azodu_keyspace.categories WHERE permalink = ?';
    const permalinkResult = await client.execute(permalinkCheckQuery, [permalink], { prepare: true });

    if (permalinkResult.rowLength > 0) {
      // Permalink exists, check if the current user is the creator
      const category = permalinkResult.first();
      if (category.creator === creator) {
        // Authorized to update the category
        const updateQuery = `
          UPDATE azodu_keyspace.categories 
          SET name = ?, description = ?, additional_info = ?
          WHERE permalink = ?;
        `;
        await client.execute(updateQuery, [name, description, additional_info, permalink], { prepare: true });
        console.log('Category updated successfully');
        res.json({ error: false, message: 'Category updated successfully. Your changes should appear in a few minutes.' });
      } else {
        // Not authorized to update the category
        res.status(403).json({ error: true, message: 'You are not authorized to edit this category.' });
      }
    } else {

      if (azoBalance < azoCost) {
        return res.status(400).json({
          error: true,
          message: `Insufficient Azo balance to create a category. Required: ${azoCost}, Your balance: ${azoBalance}`
        });
      }



      // Permalink does not exist, creating a new category
      const insertQuery = `
        INSERT INTO azodu_keyspace.categories (permalink, name, creator, description, date_created, additional_info)
        VALUES (?, ?, ?, ?, toTimestamp(now()), ?);
      `;
      await client.execute(insertQuery, [permalink, name, creator, description, additional_info], { prepare: true });
      console.log('Category created successfully');
      res.json({ error: false, message: 'Success! Your category will appear in a few minutes.' });
    }
  } catch (error) {
    console.error('Error creating or updating category:', error);
    res.status(500).json({ error: true, message: 'Failed to create or update category.' });
  }
});





app.get('/c/:permalink',cacheDuration(300), async (req, res) => {
  let { permalink } = req.params;

  try {
      const category = await fetchCategoryByName(client, permalink,cache);
      if (category) {
          res.render('category', { category: category });
      } else {
          res.status(404).send('Category not found');
      }
  } catch (error) {
      console.error('Error fetching category:', error);
      res.status(500).send('Internal Server Error');
  }
});



app.get('/u/:username', async (req, res) => {
  const username = req.params.username;

  try {
    const userResult = await client.execute('SELECT * FROM azodu_keyspace.users WHERE username = ?', [username], { prepare: true });
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: `User ${username} not found.` });
    }
    const user = userResult.rows[0];

    const postsResult = await client.execute('SELECT * FROM azodu_keyspace.posts_by_author WHERE author = ?', [username], { prepare: true });
    const commentsResult = await client.execute('SELECT * FROM azodu_keyspace.comments_by_author WHERE author = ?', [username], { prepare: true });

    const totalAzoEarned = calculateAzo(postsResult.rows, commentsResult.rows);
    const azoBalance = totalAzoEarned - user.azo_spent;

    // Render the user page with AZO balance
    res.render('userPage', {
      user: user,
      azoBalance: azoBalance,
      azoEarned: totalAzoEarned,
      posts: postsResult.rows,
      comments: commentsResult.rows,
      category: {} // Assuming you need this for the sidebar or other parts of the template
    });
  } catch (error) {
    console.error(`Failed to fetch data for user ${username}:`, error);
    res.status(500).json({ error: 'Failed to fetch data due to an internal error.' });
  }
});

function calculateAzo(posts, comments) {
  let azo = 0;
  posts.forEach(post => azo += post.upvotes);
  comments.forEach(comment => azo += comment.upvotes);
  return azo;
}


async function calculateAzoForUser(username) {
  const postsResult = await client.execute('SELECT upvotes FROM azodu_keyspace.posts_by_author WHERE author = ?', [username], { prepare: true });
  const commentsResult = await client.execute('SELECT upvotes FROM azodu_keyspace.comments_by_author WHERE author = ?', [username], { prepare: true });
  
  let totalAzo = 0;
  postsResult.rows.forEach(post => totalAzo += post.upvotes);
  commentsResult.rows.forEach(comment => totalAzo += comment.upvotes);
  
  return totalAzo;
}




app.get('/',cacheDuration(600), async (req, res) => {


res.render('index', { category: {} });


}); 


app.get('/submit-category/', cacheDuration(3600),async (req, res) => {


  res.render('submitCategory',{ category: {} });


}); 







app.get('/submit-post/',cacheDuration(3600), async (req, res) => {


  res.render('submitPost',{ category: {} });


}); 


// post page
app.get('/c/:category/:uniqueId/:title',cacheDuration(0), async (req, res) => {
  const { category, uniqueId } = req.params;
  try {
    const post = await fetchPostByPostID(client, category, uniqueId);

    let categoryData = {};
   
    categoryData = await fetchCategoryByName(client, category,cache);
    
 

    res.render('postPage', { post: post, category: categoryData });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).send('Failed to fetch post');
  }
});




app.get('/api/categories',cacheDuration(600), async (req, res) => {
  try {
    // Check if the entire category cache is valid
    if (cache.category.lastFetched && isCacheValid(cache.category.lastFetched, cache.category.ttl)) {
      // If cache is valid, convert cached category data to array format and return
      const categories = Object.values(cache.category.permalinks).map(item => item.data);
      res.json(categories);
    } else {
      // If cache is invalid or empty, fetch from database
      const query = 'SELECT * FROM azodu_keyspace.categories';
      const result = await client.execute(query);
      const freshCategories = result.rows;

      // Clear old cache and update with new data
      cache.category.permalinks = {};
      freshCategories.forEach(cat => {
        cache.category.permalinks[cat.permalink] = { data: cat };
      });

      // Update the last fetched timestamp for the entire cache
      cache.category.lastFetched = new Date();

      res.json(freshCategories);
    }
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    res.status(500).send('Failed to fetch categories');
  }
});



app.get('/api/categories/:permalink',cacheDuration(0), async (req, res) => {
  const { permalink } = req.params;

  try {
    // Check if category is available in cache
    if (cache.category.permalinks[permalink]) {
      res.json({ category: cache.category.permalinks[permalink].data });
    } else {
      // Fetch from the database if not available in cache
      const query = 'SELECT * FROM azodu_keyspace.categories WHERE permalink = ?';
      const result = await client.execute(query, [permalink], { prepare: true });

      if (result.rowLength > 0) {
        const category = result.first();

        // Update cache with new data
        cache.category.permalinks[permalink] = { data: category, lastFetched: new Date() };

        res.json({ category: category });
      } else {
        res.status(404).json({ message: 'Category not found' });
      }
    }
  } catch (error) {
    console.error('Failed to fetch category:', error);
    res.status(500).send('Failed to fetch category');
  }
});




app.post('/api/vote', authenticateToken, async (req, res) => {
  const { post_id, voteValue, root_post_id } = req.body;  // Changed to receive `voteValue` as an integer
  const ip = req.ip;
  const voter = req.user.username;


  if (isPostOlderThanDays(post_id, DAYS_TILL_VOTING_ALLOWED)) {
    return res.status(403).send('The post is archived. Voting is disabled.');
  }


  try {
    await insertOrUpdateVote(client, post_id, voteValue, ip);  // Using the modified function that handles integers

    if ((root_post_id && post_id) && (root_post_id != post_id)) {  // Handling for comments
      await tallyVotesForComment(client, root_post_id, post_id);  // Existing logic to tally votes for comments
    }

    res.json({ message: 'Vote recorded successfully.' });
  } catch (error) {
    console.error('Error recording vote:', error);
    res.status(500).send('Failed to record vote');
  }
});






app.post('/api/comment', authenticateToken, async (req, res) => {
  let { post_id, content, parent_id, isEdit, commentId, isDelete, postPermalink } = req.body;
  const author = req.user.username; // Ideally, this comes from the session or authentication mechanism


  if (isDelete) {
    try {
      const roles = req.user.roles || [];
      const commentDetails = await getCommentDetails(client, post_id, commentId);
      if (!commentDetails) {
        return res.status(404).send('Comment not found');
      }

      const hasPermission = commentDetails.author === author || roles.includes('admin') || roles.includes('super_admin');
      if (!hasPermission) {
        return res.status(403).send('Forbidden: You are not authorized to delete this comment.');
      }

      // Construct the deletion message
      const deletedByMessage = commentDetails.author === author ? '<p>[deleted by author]</p>' : '<p>[deleted by admin]</p>';
      const deletedAuthor = 'deleted';

      // Update the comment content and set author as 'deleted'
      const updateQuery = `
        UPDATE azodu_keyspace.comments
        SET content = ?, author = ?
        WHERE post_id = ? AND comment_id = ?`;

      await client.execute(updateQuery, [deletedByMessage, deletedAuthor, post_id, commentId], { prepare: true });

      res.json({ message: 'Comment deleted successfully.', commentId: commentId });
    } catch (error) {
      console.error('Error in delete operation:', error);
      res.status(500).send('Failed to delete comment');
    }
    return;
  }


  if (isPostOlderThanDays(post_id, DAYS_TILL_ALLOWED_TO_COMMENT)) {
    return res.status(403).send('The post is archived. Comments are disabled.');
  }



  // Check if user is currently timed out
  const timeoutSeconds = checkTimeout(author);
  if (timeoutSeconds) {
    return res.status(429).json({
      status: 'error',
      message: `You must wait ${timeoutSeconds} more seconds before submitting again.`,
      error: true
    });
  }


  if (!validateComment(content).isValid)
    return;

  try {
    const isContentSafe = await moderateContent(content, undefined, author);
    console.log("Is content safe?", isContentSafe);
    if (!isContentSafe) {
      const nextTimeoutDuration = setTimeoutForUser(author);

      return res.status(400).json({ message: `Your comment was not approved because it was found by AI to be against our content policies. Wait ${nextTimeoutDuration / 1000} seconds before you can submit again. If you believe this was in error, contact info@azodu.com with the full post or post it in our Discord.` });
    }
  } catch (error) {
    console.error(error.message);
    return;
  }

  // Check if the action is to edit an existing comment
  if (isEdit) {
    try {
      // Fetch the current details of the comment from the database
      const commentDetails = await getCommentDetails(client, post_id, commentId);
      // Verify if the author of the request is the same as the author of the comment
      if (commentDetails.author !== author) {
        return res.status(403).send('Forbidden: You are not authorized to edit this comment.');
      }

      // If the author matches, proceed with updating the comment
      await updateCommentData(client, commentId, content, post_id);
      res.json({ message: 'Comment updated successfully.', commentId: commentId });
    } catch (error) {
      console.error('Error in update operation:', error);
      res.status(500).send('Failed to perform operation');
    }
  } else {
    // Handle new comment insertion
    const generatedCommentId = generateContentId(); // Generate a unique comment ID

    try {
      await insertCommentData(client, generatedCommentId, post_id.toString(), author, parent_id.toString() || post_id.toString(), 'text', processHTMLFromUsers(content), 0, 0, postPermalink, new Date());
      res.json({ message: 'Comment added successfully.', commentId: generatedCommentId });
    } catch (error) {
      console.error('Error inserting comment:', error);
      res.status(500).send('Failed to insert comment');
    }
  }
});



function hasAdminRole(roles) {
  return roles?.includes('admin') || roles?.includes('super_admin');
}

app.post('/api/pinPost', authenticateToken, async (req, res) => {
  const { post_id, category } = req.body;
  const username = req.user.username;

  try {
    const userQuery = 'SELECT roles, username FROM azodu_keyspace.users WHERE username = ?';
    const userResult = await client.execute(userQuery, [username], { prepare: true });
    const user = userResult.rows[0];
    
    const categoryQuery = 'SELECT creator FROM azodu_keyspace.categories WHERE permalink = ?';
    const categoryResult = await client.execute(categoryQuery, [category], { prepare: true });
    const categoryCreator = categoryResult.rows[0]?.creator;

    const isAdmin = hasAdminRole(user.roles);
    const isCreator = username === categoryCreator;

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: 'Not authorized to pin posts in this category.' });
    }

    const pinPostQuery = 'INSERT INTO azodu_keyspace.pinned_posts (category, post_id) VALUES (?, ?)';
    await client.execute(pinPostQuery, [category, post_id], { prepare: true });
    updatePinnedPostsCache(category);
    res.status(200).json({ message: 'Post pinned successfully.' });
  } catch (error) {
    console.error('Error pinning post:', error);
    res.status(500).json({ message: 'Failed to pin post.' });
  }
});

app.post('/api/unpinPost', authenticateToken, async (req, res) => {
  const { post_id, category } = req.body;
  const username = req.user.username;

  try {
    const userQuery = 'SELECT roles FROM azodu_keyspace.users WHERE username = ?';
    const userResult = await client.execute(userQuery, [username], { prepare: true });
    const user = userResult.rows[0];

    const categoryQuery = 'SELECT creator FROM azodu_keyspace.categories WHERE permalink = ?';
    const categoryResult = await client.execute(categoryQuery, [category], { prepare: true });
    const categoryCreator = categoryResult.rows[0]?.creator;

    const isAdmin = hasAdminRole(user.roles);
    const isCreator = username === categoryCreator;

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: 'Not authorized to unpin posts in this category.' });
    }

    const unpinPostQuery = 'DELETE FROM azodu_keyspace.pinned_posts WHERE category = ? AND post_id = ?';
    await client.execute(unpinPostQuery, [category, post_id], { prepare: true });
    updatePinnedPostsCache(category);
    res.status(200).json({ message: 'Post unpinned successfully.' });
  } catch (error) {
    console.error('Error unpinning post:', error);
    res.status(500).json({ message: 'Error unpinning the post.' });
  }
});




function deletePostFromSummary(postId) {
  // Check if the post exists in the summary
  if (postsCache.hasOwnProperty(postId)) {
    // Delete the post from the summary
    delete postsCache[postId];
    console.log(`Deleted post with ID ${postId} from postsCache.`);
  } else {
    console.log(`Post with ID ${postId} not found in postsCache.`);
  }
}


app.post('/api/deletePost', authenticateToken, async (req, res) => {
  const { postId, category } = req.body;
  const username = req.user.username;

  if (!postId || !category) {
    return res.status(400).json({ message: 'Post ID and category are required.' });
  }

  try {
    const postQuery = 'SELECT author, post_type, content FROM azodu_keyspace.posts WHERE post_id = ? AND category = ?';
    const postResult = await client.execute(postQuery, [postId, category], { prepare: true });

    if (postResult.rowLength === 0) {
      return res.status(404).json({ message: 'Post not found.' });
    }

    const post = postResult.first();
    const roles = req.user.roles || [];

    if (post.author !== username && !roles.includes('admin') && !roles.includes('super_admin')) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    if (post.post_type === 'url') {
      const linkToDelete = post.content;
      const deleteLinkQuery = 'DELETE FROM azodu_keyspace.links WHERE link = ? AND category = ?';
      await client.execute(deleteLinkQuery, [linkToDelete, category], { prepare: true });
    }

    // Construct the deletion messages
    const deletedByMessage = post.author === username ? '[deleted by author]' : '[deleted by admin]';
    const deletedAuthor = 'deleted';

    // Update post with deletion messages and set author as 'deleted'
    const updateQuery = `
      UPDATE azodu_keyspace.posts
      SET title = ?, content = ?, ai_summary = '', thumbnail = '', author = ?
      WHERE post_id = ? AND category = ?`;

    await client.execute(updateQuery, [deletedByMessage, '<p>' + deletedByMessage + '</p>', deletedAuthor, postId, category], { prepare: true });

    res.json({ message: 'Post and associated link deleted successfully.' });
  } catch (error) {
    console.error('Error updating post as deleted:', error);
    res.status(500).json({ message: 'Error updating the post as deleted.' });
  }
});

app.post('/api/savePost', authenticateToken, async (req, res) => {
  const { postId, category } = req.body; // Now includes category
  const username = req.user.username; // Username from JWT after authentication

  if (!postId || !category) {
    return res.status(400).json({ message: 'Both Post ID and category are required.' });
  }

  try {
    // Verify that the post exists by including category in the query
    const postQuery = 'SELECT * FROM azodu_keyspace.posts WHERE post_id = ? AND category = ?';
    const postResult = await client.execute(postQuery, [postId, category], { prepare: true });

    if (postResult.rowLength === 0) {
      return res.status(404).json({ message: 'Post not found in the specified category.' });
    }

    // Assuming savePostForUser is adapted to handle category
    await savePostForUser(client, username, postId, category);

    res.json({ message: 'Post saved successfully.' });
  } catch (error) {
    console.error('Error saving post:', error);
    res.status(500).json({ message: 'Error saving the post.' });
  }
});


app.post('/api/unsavePost', authenticateToken, async (req, res) => {
  const { postId } = req.body; // category not needed for unsave action
  const username = req.user.username; // Username from JWT after authentication

  if (!postId) {
    return res.status(400).json({ message: 'Post ID is required.' });
  }

  try {
    // Verify that the post is actually saved by the user
    const savedPostQuery = 'SELECT * FROM azodu_keyspace.user_saved_posts WHERE username = ? AND post_id = ?';
    const savedPostResult = await client.execute(savedPostQuery, [username, postId], { prepare: true });

    if (savedPostResult.rowLength === 0) {
      return res.status(404).json({ message: 'Post not found in your saved posts.' });
    }

    // Remove the post from the user's saved posts
    const unsavePostQuery = 'DELETE FROM azodu_keyspace.user_saved_posts WHERE username = ? AND post_id = ?';
    await client.execute(unsavePostQuery, [username, postId], { prepare: true });

    res.json({ message: 'Post unsaved successfully.' });
  } catch (error) {
    console.error('Error unsaving post:', error);
    res.status(500).json({ message: 'Error unsaving the post.' });
  }
});


app.post('/api/saveComment', authenticateToken, async (req, res) => {
  const { commentId, postId } = req.body; // Include postId in the request body
  const username = req.user.username;

  if (!commentId || !postId) {
    return res.status(400).json({ message: 'Comment ID and Post ID are required.' });
  }

  try {
    await saveCommentForUser(client, username, commentId, postId);
    res.json({ message: 'Comment saved successfully.' });
  } catch (error) {
    console.error('Error saving comment:', error);
    res.status(500).json({ message: 'Error saving the comment.' });
  }
});


app.post('/api/unsaveComment', authenticateToken, async (req, res) => {
  const { commentId, postId } = req.body; // Include postId in the request body for consistency
  const username = req.user.username; // Username obtained from the authenticated token

  if (!commentId || !postId) {
    return res.status(400).json({ message: 'Comment ID and Post ID are required.' });
  }

  try {
    // Assuming the existence of a function that removes the comment from saved comments
    await unsaveCommentForUser(client, username, commentId);
    res.json({ message: 'Comment unsaved successfully.' });
  } catch (error) {
    console.error('Error unsaving comment:', error);
    res.status(500).json({ message: 'Error unsaving the comment.' });
  }
});




// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});



// Helper function to calculate controversial points
function controversialScore(post) {
  return Math.min(post.upvotes, post.downvotes);
}

// Helper function to determine if a post is controversial (updated sorting mechanism)
function isControversial(post) {
  return controversialScore(post) > 0; // only consider posts controversial if they have at least one "controversial point"
}


// Helper function to calculate top score
function topScore(post) {
  // Example score calculation, you can adjust as needed
  return (post.upvotes - post.downvotes) / ((Date.now() - new Date(post.timestamp).getTime()) / 3600000 + 1);
}



// Adjust the API route to use the new sorting logic
app.get('/api/posts', cacheDuration(600), async (req, res) => {
  const { startPostId, category, sort = 'latest' } = req.query;

  try {
    // Define cache key
    const cacheKey = category === 'anything' ? `posts_all_${sort}` : `posts_${category}_${sort}`;

    // Check for cached data
    let allSortedPosts = fullPostsCache.get(cacheKey);
    if (!allSortedPosts) {
      let query;
      let params = [];

      // Adjust query based on category
      if (category === 'anything') {
        query = 'SELECT * FROM azodu_keyspace.posts LIMIT ?';
        params = [NUM_POSTS_CACHED];
      } else {
        query = 'SELECT * FROM azodu_keyspace.posts WHERE category = ? LIMIT ?';
        params = [category, NUM_POSTS_CACHED];
      }

      const result = await client.execute(query, params, { prepare: true });
      let posts = result.rows;

      // Filter out 'azodu' category posts if 'anything' is specified
      if (category === 'anything') {
        posts = posts.filter(post => post.category !== 'azodu');
      }

      // Sort posts based on the sort parameter
      switch (sort) {
        case 'top':
          posts.sort((a, b) => topScore(b) - topScore(a));
          break;
        case 'controversial':
          posts = posts.filter(isControversial).sort((a, b) => controversialScore(b) - controversialScore(a));
          break;
        case 'latest':
        default:
          posts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          break;
      }

      // Save sorted and fetched posts to cache
      fullPostsCache.set(cacheKey, posts, 300); // Cache for 5 minutes
      allSortedPosts = posts;
    }

    // Find the starting index if startPostId is specified
    let startIndex = 0;
    if (startPostId) {
      startIndex = allSortedPosts.findIndex(post => post.post_id.toString() === startPostId) + 1;
    }

    // Limit the number of posts to return
    const postsToShow = allSortedPosts.slice(startIndex, startIndex + 30);

    // Include pinned posts if this is the first page
    if (startIndex === 0 && pinnedPostsCache[category]) {
      const pinnedPosts = pinnedPostsCache[category];
      postsToShow.unshift(...pinnedPosts);
    }

    res.json(postsToShow);
  } catch (error) {
    console.error('Failed to fetch posts:', error);
    res.status(500).send('Failed to fetch posts');
  }
});









app.get('/api/mySavedPosts', authenticateToken,cacheDuration(0), async (req, res) => {
  const username = req.user.username; // Username from JWT after authentication

  try {
    // Query to fetch saved posts for the authenticated user with category information
    const savedPostsQuery = `
      SELECT post_id, category, saved_timestamp
      FROM azodu_keyspace.user_saved_posts 
      WHERE username = ?;
    `;
    const savedPostsResult = await client.execute(savedPostsQuery, [username], { prepare: true });

    // If the user has saved posts, fetch details of those posts
    if (savedPostsResult.rowLength > 0) {
      const savedPostsData = savedPostsResult.rows;

      // Sort saved posts by saved timestamp in descending order
      savedPostsData.sort((a, b) => b.saved_timestamp.getTime() - a.saved_timestamp.getTime());

      // Fetch each post's details based on category and post_id
      const postsDetailsPromises = savedPostsData.map(({ post_id, category }) =>
        client.execute('SELECT * FROM azodu_keyspace.posts WHERE post_id = ? AND category = ?', [post_id, category], { prepare: true })
      );
      const postsDetailsResults = await Promise.all(postsDetailsPromises);

      // Extract posts from results
      const posts = postsDetailsResults.map(result => result.rows[0]); // Assuming each query returns exactly one post

      res.json(posts);
    } else {
      // If the user has no saved posts, return an empty array
      res.json([]);
    }
  } catch (error) {
    console.error('Error fetching saved posts:', error);
    res.status(500).json({ message: 'Error fetching saved posts.' });
  }
});




app.get('/api/mySavedComments', authenticateToken,cacheDuration(0), async (req, res) => {
  const username = req.user.username; // Extracted from JWT after authentication
  try {
    // Query to fetch saved comments for the authenticated user
    const savedCommentsQuery = `
      SELECT comment_id, post_id 
      FROM azodu_keyspace.user_saved_comments 
      WHERE username = ?
      ORDER BY comment_id DESC;
    `;
    const savedCommentsResult = await client.execute(savedCommentsQuery, [username], { prepare: true });

    // Check if there are saved comments to process
    if (savedCommentsResult.rowLength > 0) {
      // Fetch each comment's detailed information from the comments table
      const commentsDetailsPromises = savedCommentsResult.rows.map(row => {
        // Assuming your comments table is keyed by (post_id, comment_id)
        return client.execute('SELECT * FROM azodu_keyspace.comments WHERE post_id = ? AND comment_id = ?', [row.post_id, row.comment_id], { prepare: true });
      });

      // Await all promises and collect results
      const commentsDetailsResults = await Promise.all(commentsDetailsPromises);

      // Prepare the comments data, ensuring only valid data is included
      const comments = commentsDetailsResults
        .map(result => result.rows[0]) // Get the first (should be only) row from each result
        .filter(comment => comment !== undefined); // Filter out any undefined results

      res.json(comments); // Send the detailed comments data
    } else {
      res.json([]); // No saved comments found, return an empty array
    }
  } catch (error) {
    console.error('Error fetching saved comments:', error);
    res.status(500).json({ message: 'Error fetching saved comments.' });
  }
});





async function initializeAllCategoriesCache(client,cache) {
  const query = 'SELECT * FROM azodu_keyspace.categories';
  try {
      const result = await client.execute(query);
      const categories = result.rows;

      // Initialize cache and update pinned posts for each category
      for (const category of categories) {
          // Initialize cache entry for each category
          cache.category.permalinks[category.permalink] = {
              data: category,
              lastFetched: new Date()
          };
        console.log('updated pinned posts cache for ' + category.permalink);
          // Update pinned posts cache for each category
          await updatePinnedPostsCache(category.permalink);
      }
  } catch (error) {
      console.error('Failed to initialize category cache:', error);
  }
}








async function main() {
  try {

  //  await flushAllTables(client, 'azodu_keyspace', 'comments'); 
  //  await flushAllTables(client, 'azodu_keyspace', 'posts'); 


    //  await dropAllTables(client, 'azodu_keyspace'); 

    await client.connect();
    await createKeyspace(client);
    await createUsersTable(client);
    await createUserEmailsTable(client);
   // await insertFakeUsers(client, usernames);
    await createCommentsTable(client);
    await createPostsTable(client);
    await createPinnedPostsTable(client);

    await createPostIdCounterTable(client);

    await createUserSavedPostsTable(client);
    await createUserSavedCommentsTable(client);

    await createVotesTable(client);
    await createCategoriesTable(client);

    //   await populateTestData(client, 10);
    await createLinksTable(client);

    await createDefaultCategories(client, defaultCategories);
    //  await emptyCommentsTable(client);
    await createMaterializedViews(client);


    //  await populateTestData(client, 10);
    await initializeAllCategoriesCache(client, cache);

    processCategoriesPeriodically();


    initializePosts(client).then(() => {
      console.log('Initial data setup complete.');
    });


  } catch (error) {
    console.error('Error:', error);
  }
}



main();
