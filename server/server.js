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


const { createKeyspace, createUsersTable, createPostsTable, createCommentsTable, flushAllTables, dropAllTables, createVotesTable,createCategoriesTable,createDefaultCategories } = require('./db/db_create');
const { insertPostData, populateTestData, insertVote,insertCommentData,generatePostIdTimestamp,insertCategoryData,updateCommentData,tallyVotesForComment,deleteCommentData,generatePermalink } = require('./db/db_insert');
const { fetchPostByPostID, fetchPostsAndCalculateVotes, getCommentDetails } = require('./db/db_query');
const { validateComment, processHTMLFromUsers, validateUsername } = require('./utils/inputValidation');
const { generateCategoryPermalink } = require('./utils/util');


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


const loginExpires = 86400 * 30; // a month
let postsVoteSummary = {};
const updateInterval = 10 * 1000; // how quickly to fetch all posts and update votes
const defaultCategories = ["everything","Books"];
const cache = {
  category: {},
  // You can add more categories here in the future, e.g., posts: {}, users: {}, etc.
};

const CACHE_VALIDITY_MS = 10 * 60 * 1000; // e.g., 10 minutes

function isCacheValid(lastFetched) {
  return (new Date() - lastFetched) < CACHE_VALIDITY_MS;
}



setInterval(() => {
  fetchPostsAndCalculateVotes(client,'everything',postsVoteSummary).then(result => {
    postsVoteSummary = result;
  }).catch(error => {
    console.error('Failed to fetch posts and calculate votes:', error);
  });
}, updateInterval);




async function fetchThumbnail(url) {
  console.log(`Fetching content from URL: ${url}`);
  try {
    const { data } = await axios.get(url);
    console.log(`Content fetched successfully from ${url}`);
    const $ = cheerio.load(data);

    let imageUrl = $('meta[property="og:image"]').attr('content');
    if (imageUrl) {
      console.log(`Open Graph image found: ${imageUrl}`);
    } else {
      console.log(`No Open Graph image found, looking for the first <img> tag...`);
      imageUrl = $('img').first().attr('src');

      if (imageUrl) {
        console.log(`First <img> tag found: ${imageUrl}`);
      } else {
        console.log(`No <img> tags found, looking for favicon...`);
        imageUrl = $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href');

        if (imageUrl) {
          console.log(`Favicon found: ${imageUrl}`);
        } else {
          console.log(`No favicon found, using domain root favicon.ico as a last resort...`);
          // Attempt to use /favicon.ico at the domain root
          const baseUrl = new URL(url);
          imageUrl = `${baseUrl.origin}/favicon.ico`;
          console.log(`Attempting to use root favicon.ico: ${imageUrl}`);
        }
      }
    }

    // Resolve relative image URLs to absolute
    if (imageUrl && !imageUrl.startsWith('http')) {
      console.log(`Image URL is relative, converting to absolute...`);
      const baseUrl = new URL(url);
      imageUrl = new URL(imageUrl, baseUrl.origin).href;
      console.log(`Converted to absolute URL: ${imageUrl}`);
    }

    return imageUrl || null; // Return null if no image is found
  } catch (error) {
    console.error(`Error fetching thumbnail from ${url}:`, error.message);
    return null;
  }
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
  const { username, password, email } = req.body;

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
      INSERT INTO my_keyspace.users (username, password, email, date_registered)
      VALUES (?, ?, ?, ?) IF NOT EXISTS;
    `;
    const insertResult = await client.execute(insertUserQuery, [username, hashedPassword, email, dateRegistered], { prepare: true });
    
    // Check if the user was actually created
    if (insertResult && insertResult.rows && insertResult.rows[0] && !insertResult.rows[0]['[applied]']) {
      return res.status(409).json({ message: 'User already exists.' });
    }

    // Use username as the unique identifier in the JWT token
    const token = jwt.sign({ username: username }, jwtSecret, {
        expiresIn: loginExpires
    });

    // Send the token with the success message
    res.status(201).json({ auth: true, token: token, message: 'User created successfully. Redirecting...' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error registering user.' });
  }
});





app.post('/api/login', async (req, res) => {

  const { username, password } = req.body;
  console.log(username, password); 

  try {
    const queryUser = 'SELECT * FROM my_keyspace.users WHERE username = ?';
    const result = await client.execute(queryUser, [username], { prepare: true });

    if (result.rowLength > 0) {
      const user = result.first();

      console.log(`User ${username}'s subscriptions:`, user.subscriptions);


      const passwordIsValid = await bcrypt.compare(password, user.password);
      if (!passwordIsValid) {
        return res.status(200).json({ message: 'Incorrect password.' });
      }

      const token = jwt.sign({ username: user.username }, jwtSecret, {
        expiresIn: loginExpires
      });

      res.status(200).json({ auth: true, token: token, message: 'Login successful.',subscriptions: user.subscriptions
    });
    } else {
      res.status(200).json({ message: 'No user found.' });
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
  const { title, category, postType, contentText, contentUrl } = req.body;
  let content = postType === 'text' ? contentText : contentUrl;
  let thumbnail = null; // Default to null if no thumbnail is fetched
  console.log(contentUrl);
  if (postType === 'text') {
    const result = validateComment(content);
    if (!result.isValid) {
      return res.status(400).json({ message: 'Failed to submit post. Reason: ' + result.message, error: true });
    }
  } else if (postType === 'url' && contentUrl) {
    // Attempt to fetch a thumbnail for link-type posts
    thumbnail = await fetchThumbnail(contentUrl);
  }

  try {
    await insertPostData(client, title, creator, category, postType, content, thumbnail);
    res.status(200).json({ message: 'Post submitted successfully. Redirecting ...' });
  } catch (error) {
    console.error('Error submitting post:', error);
    res.status(500).json({ message: 'Failed to submit post' });
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




async function fetchCategoryByName(client, permalink) {
  // Check if category is in cache and valid
  if (cache.category[permalink] && isCacheValid(cache.category[permalink].lastFetched)) {
      console.log('Serving category from cache');
      return cache.category[permalink].data;
  }

  const categoryQuery = 'SELECT * FROM my_keyspace.categories WHERE permalink = ?';
  try {
      const categoryResult = await client.execute(categoryQuery, [permalink], { prepare: true });

      if (categoryResult.rowLength > 0) {
          const category = categoryResult.first();
          const postsQuery = 'SELECT * FROM my_keyspace.posts WHERE category = ? LIMIT 30';
          const postsResult = await client.execute(postsQuery, [permalink], { prepare: true });
          category.posts = postsResult.rows;

          // Cache the category data with current timestamp
          cache.category[permalink] = {
              data: category,
              lastFetched: new Date()
          };

          return category;
      } else {
          // If category not found, you can decide how you want to handle this. For now, returning null.
          return null;
      }
  } catch (error) {
      console.error('Error fetching category by name:', error);
      throw error; // Rethrow the error to handle it in the calling context
  }
}



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
    const generatedCommentId = generatePostIdTimestamp(); // Generate a unique comment ID

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

 //      await flushAllTables(client,'my_keyspace'); 
  //   await dropAllTables(client, 'my_keyspace'); 

    await client.connect();
    await createKeyspace(client);

    await createUsersTable(client);
    await createCommentsTable(client);
    await createPostsTable(client);
    await createVotesTable(client);
    await createCategoriesTable(client);

  //  await populateTestData(client, 10);

 
  //  await createDefaultCategories(client,defaultCategories);


  } catch (error) {
    console.error('Error:', error);
  }
}



main();
