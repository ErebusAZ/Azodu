const express = require('express');
const bodyParser = require('body-parser');
const cassandra = require('cassandra-driver');
const uuid = require('uuid');
const path = require('path');


const { createKeyspace, createUsersTable, createPostsTable, createCommentsTable, flushAllTables, dropAllTables, createVotesTable } = require('./db/db_create');
const { insertPostData, populateTestData, insertVote,insertCommentData,generateShortId } = require('./db/db_insert');
const { fetchPostByPostID,fetchPostsAndCalculateVotes } = require('./db/db_query');


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
const updateInterval = 10 * 1000; // how quickly to fetch all posts and update votes



setInterval(() => fetchPostsAndCalculateVotes(client), updateInterval);


// Define the route for form submission
app.post('/submitPost', async (req, res) => {
  const { title, subreddit, postType, contentText, contentUrl } = req.body;
  const content = postType === 'text' ? contentText : contentUrl;

  await insertPostData(client, title, 'bobert', subreddit, postType, content);

  // Redirect to home or any other page after submission
  res.redirect('/'); // Adjust the redirect URL as needed
});

app.get('/p/:subreddit/:uniqueId/:title', async (req, res) => {
  const { subreddit, uniqueId, title } = req.params;
  // Use the parameters to query your Cassandra database for the post data
  // For the sake of example, let's assume you have a function `fetchPostByPostID` that does this
  try {
    const post = await fetchPostByPostID(client, uniqueId);
    // Now, render an HTML page using the post data
    // If you're using a templating engine like EJS, Pug, or Handlebars, you can render a template:
    // res.render('postPage', { post: post });

    res.render('postPage', { post: post });



  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).send('Failed to fetch post');
  }
});

app.post('/api/vote', async (req, res) => {
  const { post_id, upvote } = req.body; // `upvote` might be a string here
  const ip = req.ip;

  // Explicitly convert `upvote` to boolean
  const isUpvote = upvote === 'true' || upvote === true; // Handles both string and boolean inputs

  try {
    await insertVote(client, post_id, isUpvote, ip);
    res.json({ message: 'Vote recorded successfully.' });
  } catch (error) {
    console.error('Error recording vote:', error);
    res.status(500).send('Failed to record vote');
  }
});

app.post('/api/comment', async (req, res) => {
  const { post_id, content, parent_id } = req.body; // Ensure you receive parent_id if the comment is a reply
  const author = 'username'; // This should ideally come from session or authentication mechanism
  const commentId = generateShortId(); // Generate a unique comment ID
  try {
    await insertCommentData(client, commentId, post_id, author, parent_id || post_id, 'text', content, 0, 0, '/comments/' + commentId, new Date());
    res.json({ message: 'Comment added successfully.', commentId: commentId });
  } catch (error) {
    console.error('Error inserting comment:', error);
    res.status(500).send('Failed to insert comment');
  }
});




// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

app.get('/api/posts', async (req, res) => {
  try {
    if (Object.keys(postsVoteSummary).length > 0) {
      res.json(Object.values(postsVoteSummary));
    } else {
      const query = 'SELECT * FROM my_keyspace.posts';
      const result = await client.execute(query);
      res.json(result.rows);
      
    }


  } catch (error) {
    console.error('Failed to fetch posts', error);
    res.status(500).send('Failed to fetch posts');
  }
});


async function main() {
  try {

    //   await flushAllTables(client,'my_keyspace'); 
   //    await dropAllTables(client, 'my_keyspace'); 

    await client.connect();
    await createKeyspace(client);

    await createUsersTable(client);
    await createCommentsTable(client);
    await createPostsTable(client);
    await createVotesTable(client);

    //  await populateTestData(client,50);

  } catch (error) {
    console.error('Error:', error);
  }
}



main();
