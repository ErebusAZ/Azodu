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





let secrets;
try {
  const secretsRaw = fs.readFileSync('secrets.json');
  secrets = JSON.parse(secretsRaw);
} catch (err) {
  console.error('Error reading secrets.json:', err);
  process.exit(1); // Exit the application if the secrets cannot be loaded
}
jwtSecret = secrets.JWT_SECRET;


const { createKeyspace, createUsersTable, createPostsTable, createCommentsTable, flushAllTables, dropAllTables, createVotesTable,createCategoriesTable,createDefaultCategories,createLinksTable,emptyCommentsTable,createMaterializedViews,insertFakeUsers,createPostIdCounterTable } = require('./db/db_create');
const { insertPostData, populateTestData, insertVote,insertCommentData,generateCommentUUID,insertCategoryData,updateCommentData,tallyVotesForComment,deleteCommentData,generatePermalink } = require('./db/db_insert');
const { fetchPostByPostID, fetchPostsAndCalculateVotes, getCommentDetails,fetchCategoryByName } = require('./db/db_query');
const { validateComment, processHTMLFromUsers, validateUsername } = require('./utils/inputValidation');
const { generateCategoryPermalink,fetchURLAndParseForThumb,extractRelevantText } = require('./utils/util');
const { generateAIComment,generateSummary } = require('./utils/ai');

const app = express();
const port = 3000; // Use any port that suits your setup

app.set('trust proxy', true); // necessary when behind cloudflare even with just gray cloud
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, '..', 'public')));

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(bodyParser.urlencoded({ extended: true }));

// Parse JSON bodies (as sent by API clients)
app.use(express.json()); // This line is added to parse JSON request bodies

const client = new cassandra.Client({
  contactPoints: ['149.28.231.86', '45.77.101.209'],
  localDataCenter: 'datacenter1',
  keyspace: 'my_keyspace'
});


let postsVoteSummary = {};



const loginExpires = 86400 * 30; // how long till login expires
const updateInterval = 10 * 1000; // how quickly to fetch all posts and update votes

const defaultCategories = ["everything","Books"];


const COMMENT_GENERATION_INTERVAL_MS = 60000; // 1 min
const COMMENT_POST_CHANCE = 1; // % chance of posting a comment on each post, 1 is 100%
const FREQUENCY_TO_CREATE_POSTS_FROM_EXTERNAL_FETCH = 60000 * 10; // 10 min

// Dedicated blacklist for posts to skip commenting
const postsCommentBlacklist = {};

const usernames = [
  "vortex",
  "ShadowPaladin",
  "mystic_monk_59",
  "VoyagerKnight",
  "echo",
  "galactic_paladin_731",
  "VoyagerMonk",
  "mystic_ranger_254",
  "VortexMonk",
  "novaninja900",
  "lunarmage527",
  "pixel_rogue_413",
  "pixelpaladin857",
  "infernomage779",
  "GalacticWizard",
  "MysticPrincess",
  "inferno_jester_886",
  "CosmicWizard",
  "QuantumMage",
  "VortexJester",
  "echosamurai123",
  "NovaRogue",
  "echo_jester",
  "spectralguru501",
  "GalacticPaladin",
  "astralprincess949",
  "cyberprince171",
  "phantompaladin236",
  "CyberGuru",
  "zenith_pirate_286",
  "lunarwarrior52",
  "pixel_king",
  "spectral",
  "cyber",
  "cosmic_pirate",
  "spectral_sorcerer_76",
  "nova",
  "astral",
  "echo_mage",
  "redditSucks",
  "LunarKing",
  "inferno",
  "NovaQueen",
  "shadow_hunter_78",
  "ShadowRunner",
  "neon_runner_650",
  "VoyagerGuru",
  "LunarHunter",
  "vortexprince699",
  "NeonQueen",
  "CosmicAdventurer",
  "mystic",
  "PhantomKnight",
  "galacticpirate921",
  "quantumguru119",
  "neon_runner_342",
  "cyber",
  "shadowking279",
  "shadow",
  "baffled",
  "STDFree",
  "Mechwarrior",
  "mrbastard",
  "bane",

];


setInterval(async () => {
  const now = new Date().getTime(); // Get current time in milliseconds

  // Convert postIds into an array of objects with postId and its weight based on timestamp
  const weightedPosts = Object.keys(postsVoteSummary)
    .filter(id => !postsCommentBlacklist[id])
    .map(id => {
      const postAgeHours = (now - new Date(postsVoteSummary[id].timestamp).getTime()) / (1000 * 60 * 60); // Calculate post age in hours
      const weight = 1 / (postAgeHours + 1); // Add 1 to avoid division by zero and invert age to weight
      return { id, weight };
    });

  // Calculate total weight
  const totalWeight = weightedPosts.reduce((acc, { weight }) => acc + weight, 0);

  // Choose a postId based on weights
  let accumulator = 0;
  const random = Math.random() * totalWeight;
  const postId = weightedPosts.find(({ weight }) => (accumulator += weight) >= random)?.id;

  if (postId && Math.random() <= COMMENT_POST_CHANCE && postsVoteSummary[postId].ai_summary) {
    const post = postsVoteSummary[postId];
    const model = "gpt-3.5-turbo";
    const comment = await generateAIComment(post.title, post.ai_summary, model, postId);

    if (comment == null || comment == 'null') {
      postsCommentBlacklist[postId] = true; // Mark the post in the dedicated blacklist
      return;
    }

    const generatedCommentId = generateCommentUUID(); // Generate a unique comment ID
    const timestamp = new Date();
    // const author = model + "_generated";
    // Select a random username from the usernames array
    const randomIndex = Math.floor(Math.random() * usernames.length);
    const author = usernames[randomIndex]; // Randomly picked author from the array


    await insertCommentData(client, generatedCommentId, postId, author, postId, "text", comment, 0, 0, `/posts/${postId}/comments/${generatedCommentId}`, timestamp);
  }
}, COMMENT_GENERATION_INTERVAL_MS);






// Assume we have a global set to store processed titles
let processedTitles = new Set();

async function fetchFromExternalAndCreatePosts() {
  try {
    const urls = [
      'https://old.reddit.com/r/news/top/.json',
   //   'https://old.reddit.com/r/worldnews/top/.json',
      'https://old.reddit.com/r/technology/top/.json',
      'https://old.reddit.com/r/Conservative/top/.json' // Ensure URL format consistency
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

      if (url.includes('reddit.com'))
        continue; 

      // Skip processing if the title has already been processed
      if (processedTitles.has(title) || processedTitles.has(url)) {
        continue;
      }

      if (postsDone > 0) break; // Process only one post for demonstration
      postsDone++;

      // pick a random author
      const randomIndex = Math.floor(Math.random() * usernames.length);
      author = usernames[randomIndex]; 


      const checkQuery = 'SELECT link FROM my_keyspace.links WHERE link = ? AND category = ?';
      const checkResult = await client.execute(checkQuery, [url, 'everything'], { prepare: true });

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

        await insertPostData(client, title, author, 'everything', 'url', url, thumbnail, summary, true);
        processedTitles.add(title); // Prevent future reposts of the same title
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


// Set the interval to run every minute
setInterval(fetchFromExternalAndCreatePosts, FREQUENCY_TO_CREATE_POSTS_FROM_EXTERNAL_FETCH);




setInterval(() => {
  fetchPostsAndCalculateVotes(client,'everything',postsVoteSummary).then(result => {
    postsVoteSummary = result;
  }).catch(error => {
    console.error('Failed to fetch posts and calculate votes:', error);
  });
}, updateInterval);







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
  const { username, password, email } = req.body;
  const clientIp = req.headers['cf-connecting-ip'] || req.ip;


  if (!validateUsername(username).isValid) {
    console.log('client tried invalid username. this should not be possible with client-side validation');
    return;
  }

  if (!username || !password || !email) {
    return res.status(400).json({ message: 'Username, password, and email are required.' });
  }

  // Hash the password before saving it to the database
  const hashedPassword = await bcrypt.hash(password, 8);
  const dateRegistered = new Date();

  try {
    const insertUserQuery = `
      INSERT INTO my_keyspace.users (username, password, email, date_registered, last_ip)
      VALUES (?, ?, ?, ?, ?) IF NOT EXISTS;
    `;
    const insertResult = await client.execute(insertUserQuery, [username, hashedPassword, email, dateRegistered, clientIp], { prepare: true });

    if (insertResult && insertResult.rows && insertResult.rows[0] && !insertResult.rows[0]['[applied]']) {
      return res.status(409).json({ message: 'User already exists.' });
    }

    const token = jwt.sign({ username: username }, jwtSecret, { expiresIn: loginExpires });
    res.status(201).json({ auth: true, token: token, message: 'User created successfully. Redirecting...' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error registering user.' });
  }
});





app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const clientIp = req.headers['cf-connecting-ip'] || req.ip;

  try {
    const queryUser = 'SELECT * FROM my_keyspace.users WHERE username = ?';
    const result = await client.execute(queryUser, [username], { prepare: true });

    if (result.rowLength > 0) {
      const user = result.first();
      const passwordIsValid = await bcrypt.compare(password, user.password);

      if (!passwordIsValid) {
        return res.status(401).json({ message: 'Incorrect password.' });
      }

      // Update last_ip field in the database
      const updateIpQuery = 'UPDATE my_keyspace.users SET last_ip = ? WHERE username = ?';
      await client.execute(updateIpQuery, [clientIp, username], { prepare: true });

      const token = jwt.sign({ username: user.username, roles: ['super_admin'] }, jwtSecret, { expiresIn: loginExpires });
      res.status(200).json({ auth: true, token: token, message: 'Login successful.' });
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
      UPDATE my_keyspace.users
      SET subscriptions = subscriptions + ?
      WHERE username = ?;
    `;
    await client.execute(updateQuery, [[permalink], username], { prepare: true });
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
      UPDATE my_keyspace.users
      SET subscriptions = subscriptions - ?
      WHERE username = ?;
    `;
    await client.execute(updateQuery, [[permalink], username], { prepare: true });
    res.json({ message: 'Unsubscribed successfully.' });
  } catch (error) {
    console.error('Unsubscription error:', error);
    res.status(500).json({ message: 'Error processing unsubscription.' });
  }
});




app.post('/submitPost', authenticateToken, async (req, res) => {
  const creator = req.user.username;
  let { title, category, postType, contentText, contentUrl } = req.body;
  let content = postType === 'text' ? contentText : contentUrl;
  let thumbnail = null;
  let summary = ""; // Initialize summary variable

  contentText = processHTMLFromUsers(contentText); 


  if (postType === 'text') {
      const result = validateComment(content);
      if (!result.isValid) {
          return res.status(400).json({ message: 'Failed to submit post. Reason: ' + result.message, error: true });
      }
  } else if (postType === 'url' && contentUrl) {


      thumbnail = await fetchURLAndParseForThumb(contentUrl);

      try {
          // Fetch content from the URL
          const { data } = await axios.get(contentUrl);
          // Extract relevant text to summarize (this step may vary based on content)
          const extractedText = extractRelevantText(data); // Implement this function based on your needs
          // Generate a summary of the extracted text
        summary = await generateSummary(extractedText);
 
               

      } catch (fetchError) {
          console.error('Error fetching URL content for: ' + contentUrl);
        //  return res.status(500).json({ message: 'Failed to fetch URL content' });
      }
  }

  try {
      await insertPostData(client, title, creator, category, postType, content, thumbnail,summary);
      res.status(200).json({ message: 'Post submitted successfully. Redirecting ...', summary: summary });
  } catch (error) {
      res.status(500).json({ message: '' + error,error: true });
  }
});




app.post('/submitCategory', authenticateToken, async (req, res) => {
  const creator = req.user.username; 
  const { name, permalinkFromClient, description } = req.body;
  const permalink = generateCategoryPermalink(permalinkFromClient);

  try {
    // Check if permalink already exists
    const permalinkCheckQuery = 'SELECT permalink FROM my_keyspace.categories WHERE permalink = ?';
    const permalinkResult = await client.execute(permalinkCheckQuery, [permalink], { prepare: true });

    if (permalinkResult.rowLength > 0) {
      // Permalink already exists
      return res.status(409).json({ error: true, message: 'A category with this permalink already exists.' });
    } else {
      // Insert new category
      const insertQuery = `
            INSERT INTO my_keyspace.categories (permalink, name, creator, description, date_created)
            VALUES (?, ?, ?, ?, toTimestamp(now()));
        `;
      await client.execute(insertQuery, [permalink, name, creator, processHTMLFromUsers(description)], { prepare: true });
      console.log('Category created successfully');
      // Instead of redirect, send a success message as JSON
      res.json({ error: false, message: 'Category created successfully' });
    }
  } catch (error) {
    console.error('Error creating category:', error);
    // Send an error message as JSON
    res.status(500).json({ error: true, message: 'Failed to create category.' });
  }
});








app.get('/c/:permalink', async (req, res) => {
  let { permalink } = req.params;

  try {
      const category = await fetchCategoryByName(client, permalink);

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

  // Query for the user's details remains the same
  const queryUser = 'SELECT * FROM my_keyspace.users WHERE username = ?';

  // Update the query for the user's posts to use the materialized view
  const queryPosts = 'SELECT * FROM my_keyspace.posts_by_author WHERE author = ?';

  // Query for the user's comments remains the same
  const queryComments = 'SELECT * FROM my_keyspace.comments_by_author WHERE author = ?';

  try {
    // Execute queries
    const resultUser = await client.execute(queryUser, [username], { prepare: true });
    const resultPosts = await client.execute(queryPosts, [username], { prepare: true });
    const resultComments = await client.execute(queryComments, [username], { prepare: true });

    // Check if the user exists
    if (resultUser.rows.length === 0) {
      return res.status(404).json({ message: `User ${username} not found.` });
    }

    // Prepare objects to pass to the template
    const user = resultUser.rows[0]; // Assuming we're interested in the first (should be only) row
    const posts = resultPosts.rows;
    const comments = resultComments.rows;

    // Render the template with user, posts, and comments
    res.render('userPage', {
      user: user,
      posts: posts,
      comments: comments,
      category: {} // Assuming you need this for the sidebar or other parts of the template
    });

  } catch (error) {
    console.error(`Failed to fetch data for user ${username}:`, error);
    res.status(500).json({ error: 'Failed to fetch data due to an internal error.' });
  }
});





app.get('/', async (req, res) => {


res.render('index', { category: {} });


}); 


app.get('/submit-category/', async (req, res) => {


  res.render('submitCategory',{ category: {} });


}); 

app.get('/submit-post/', async (req, res) => {


  res.render('submitPost',{ category: {} });


}); 


app.get('/c/:category/:uniqueId/:title', async (req, res) => {
  const { category, uniqueId } = req.params;
  try {
    const post = await fetchPostByPostID(client, category, uniqueId);

    let categoryData = {};
   
    categoryData = await fetchCategoryByName(client, category);
    
 

    res.render('postPage', { post: post, category: categoryData });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).send('Failed to fetch post');
  }
});




app.get('/api/categories', async (req, res) => {
  try {
    const query = 'SELECT * FROM my_keyspace.categories';
    const result = await client.execute(query);

    // Send the result rows back as the response
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    res.status(500).send('Failed to fetch categories');
  }
});




app.post('/api/vote', async (req, res) => {
  const { post_id, upvote,root_post_id } = req.body; // `upvote` might be a string here
  const ip = req.ip;

  // Explicitly convert `upvote` to boolean
  const isUpvote = upvote === 'true' || upvote === true; // Handles both string and boolean inputs

  try {
    await insertVote(client, post_id, isUpvote, ip);
    if((root_post_id && post_id) && (root_post_id != post_id)) // only comments are tallied here as posts are tallied elsewhere
    await tallyVotesForComment(client,root_post_id, post_id); // Indicate it's a comment

    res.json({ message: 'Vote recorded successfully.' });
  } catch (error) {
    console.error('Error recording vote:', error);
    res.status(500).send('Failed to record vote');
  }
});







app.post('/api/comment', authenticateToken, async (req, res) => {
  let { post_id, content, parent_id, isEdit, commentId, isDelete } = req.body;
  const author = req.user.username; // Ideally, this comes from the session or authentication mechanism


  // Check if the action is to delete an existing comment
  if (isDelete) {
    try {

      console.log(post_id, content, parent_id, isEdit, commentId, isDelete);
      // Fetch the current details of the comment from the database
      const commentDetails = await getCommentDetails(client, post_id, commentId);
      // Verify if the author of the request is the same as the author of the comment
      if (commentDetails.author !== author) {
        return res.status(403).send('Forbidden: You are not authorized to delete this comment.');
      }

      // If the author matches, proceed with deleting the comment
      await deleteCommentData(client, commentId, post_id);
      res.json({ message: 'Comment deleted successfully.', commentId: commentId });
    } catch (error) {
      console.error('Error in delete operation:', error);
      res.status(500).send('Failed to delete comment');
    }
    return; 
  }

  if (!validateComment(content).isValid)
    return;

  // Check if the action is to edit an existing comment
  else if (isEdit) {
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
    const generatedCommentId = generateCommentUUID(); // Generate a unique comment ID

    try {
      await insertCommentData(client, generatedCommentId, post_id.toString(), author, parent_id.toString() || post_id.toString(), 'text', processHTMLFromUsers(content), 0, 0, '/comments/' + generatedCommentId, new Date());
      res.json({ message: 'Comment added successfully.', commentId: generatedCommentId });
    } catch (error) {
      console.error('Error inserting comment:', error);
      res.status(500).send('Failed to insert comment');
    }
  }
});



app.post('/api/pinPost', authenticateToken, async (req, res) => {
  const { category, post_id } = req.body;
  console.log(category, post_id);
  const pinPrefix = 'pinned_';
  const newPostId = `${pinPrefix}${post_id}`;

  try {
    // Step 1: Fetch the existing post
    const selectQuery = 'SELECT * FROM my_keyspace.posts WHERE category = ? AND post_id = ?';
    const postResult = await client.execute(selectQuery, [category, post_id], { prepare: true });

    if (postResult.rowLength === 0) {
      return res.status(404).json({ message: 'Post not found.' });
    }

    const roles = req.user.roles || [];

    // Check if the user is the author or has an admin/super_admin role
    if (!roles.includes('admin') && !roles.includes('super_admin')) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }

    const post = postResult.first();

    // Generate a new permalink including the 'pinned_' prefix in the post_id part
    const newPermalink = generatePermalink(post.title, category, newPostId);


    // Step 2: Insert a new post with the updated post_id and identical other fields
    const insertQuery = `
      INSERT INTO my_keyspace.posts 
      (category, post_id, title, author, post_type, content, upvotes, downvotes, comment_count, permalink, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `;
    await client.execute(insertQuery, [
      category,
      newPostId,
      post.title,
      post.author,
      post.post_type,
      post.content,
      post.upvotes,
      post.downvotes,
      post.comment_count,
      newPermalink,
      post.timestamp
    ], { prepare: true });

    // Step 3: Optionally, delete the original post to avoid duplication
    // Note: Consider the implications of this operation carefully, especially regarding links or references to the original post_id
    const deleteQuery = 'DELETE FROM my_keyspace.posts WHERE category = ? AND post_id = ?';
    await client.execute(deleteQuery, [category, post_id], { prepare: true });

    res.json({ message: 'Post pinned successfully.' });
  } catch (error) {
    console.error('Error pinning post:', error);
    res.status(500).json({ message: 'Error processing pinning operation.' });
  }
});


function deletePostFromSummary(postId) {
  // Check if the post exists in the summary
  if (postsVoteSummary.hasOwnProperty(postId)) {
    // Delete the post from the summary
    delete postsVoteSummary[postId];
    console.log(`Deleted post with ID ${postId} from postsVoteSummary.`);
  } else {
    console.log(`Post with ID ${postId} not found in postsVoteSummary.`);
  }
}


app.post('/api/deletePost', authenticateToken, async (req, res) => {
  const { postId, category } = req.body; // Destructure both postId and category from the request body
  const username = req.user.username; // Username from JWT after authentication

  if (!postId || !category) {
    return res.status(400).json({ message: 'Post ID and category are required.' });
  }

  try {
    // First, fetch the post to check the author and compare with the authenticated user
    const postQuery = 'SELECT author FROM my_keyspace.posts WHERE post_id = ? AND category = ?';
    const postResult = await client.execute(postQuery, [postId, category], { prepare: true });

    if (postResult.rowLength === 0) {
      return res.status(404).json({ message: 'Post not found.' });
    }

    const post = postResult.first();
    const roles = req.user.roles || [];

    // Check if the user is the author or has an admin/super_admin role
    if (post.author !== username && !roles.includes('admin') && !roles.includes('super_admin')) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }


    deletePostFromSummary(postId);

    // Proceed to delete the post using both post_id and category to target the specific post
    const deleteQuery = 'DELETE FROM my_keyspace.posts WHERE post_id = ? AND category = ?';
    await client.execute(deleteQuery, [postId, category], { prepare: true });
    res.json({ message: 'Post deleted successfully.' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ message: 'Error deleting the post.' });
  }
});






// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

app.get('/api/posts', async (req, res) => {
  let { startPostId, category } = req.query;
  category = (category && category != 'null' && category != undefined ? category : category = 'everything');
  let params = [category];
  let query = 'SELECT * FROM my_keyspace.posts WHERE category = ?';

  if (startPostId) {
    // Adjust the operator if necessary based on actual ordering and desired pagination direction
    query += ' AND post_id < ?';
    params.push(startPostId);
  }

  query += ' LIMIT 30';

  try {
    const result = await client.execute(query, params, { prepare: true });
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch posts:', error);
    res.status(500).send('Failed to fetch posts');
  }
});



async function main() {
  try {

    //   await flushAllTables(client,'my_keyspace','comments'); 
   // await dropAllTables(client, 'my_keyspace'); 

    await client.connect();
    await createKeyspace(client);

    await createUsersTable(client);
   
    await insertFakeUsers(client,usernames); 
    await createCommentsTable(client);
    await createPostsTable(client);
    await createPostIdCounterTable(client);
    await createVotesTable(client);
    await createCategoriesTable(client);

 //   await populateTestData(client, 10);
    await createLinksTable(client); 

    await createDefaultCategories(client, defaultCategories);
   //  await emptyCommentsTable(client);
    await createMaterializedViews(client);

  //  await populateTestData(client, 50);


  } catch (error) {
    console.error('Error:', error);
  }
}



main();
