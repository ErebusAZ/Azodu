const express = require('express');
const bodyParser = require('body-parser');
const cassandra = require('cassandra-driver');
const uuid = require('uuid');
const path = require('path');


const { createKeyspace, createUsersTable, createPostsTable, createCommentsTable, flushAllTables, dropAllTables, createVotesTable,createCategoriesTable } = require('./db/db_create');
const { insertPostData, populateTestData, insertVote,insertCommentData,generatePostIdTimestamp,insertCategoryData } = require('./db/db_insert');
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



setInterval(() => {
  fetchPostsAndCalculateVotes(client,'everything',postsVoteSummary).then(result => {
    postsVoteSummary = result;
  }).catch(error => {
    console.error('Failed to fetch posts and calculate votes:', error);
  });
}, updateInterval);

// Define the route for form submission
app.post('/submitPost', async (req, res) => {
  const { title, category, postType, contentText, contentUrl } = req.body;
  const content = postType === 'text' ? contentText : contentUrl;

  await insertPostData(client, title, 'bobert', category, postType, content);

  // Redirect to home or any other page after submission
  res.redirect('/'); // Adjust the redirect URL as needed
});


function generateCategoryPermalink(title) {
  const basePath = "";
  const cleanedTitle = title
    .replace(/[^\w\s]/gi, '') // Remove non-alphanumeric characters except spaces
    .trim() // Remove leading and trailing spaces
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .toLowerCase(); // Convert to lowercase

  const truncatedTitle = cleanedTitle.substring(0, 147); // Truncate to 147 characters to leave room for "/c/"
  return basePath + truncatedTitle;
}




app.post('/submitCategory', async (req, res) => {
  const { name, creator, description } = req.body;
  const permalink = generateCategoryPermalink(name);

  try {
    // Check if permalink already exists
    const permalinkCheckQuery = 'SELECT permalink FROM my_keyspace.categories WHERE permalink = ?';
    const permalinkResult = await client.execute(permalinkCheckQuery, [permalink], { prepare: true });

    if (permalinkResult.rowLength > 0) {
      // Permalink already exists
      return res.send('A category with this permalink already exists.');
    } else {
      // Insert new category
      const insertQuery = `
        INSERT INTO my_keyspace.categories (permalink, name, creator, description, date_created)
        VALUES (?, ?, ?, ?, toTimestamp(now()));
      `;
      console.log(permalink, name, creator, description); 
      await client.execute(insertQuery, [permalink, name, creator, description], { prepare: true });
      console.log('Category created successfully');
      res.redirect('/'); // Adjust the redirect as needed
    }
  } catch (error) {
    console.error('Error creating category:', error);
    res.send('Failed to create category.');
  }
});

function convertTimestampToDatePath(timestamp) {
  const year = timestamp.substring(0, 4);
  const month = timestamp.substring(4, 6);
  const day = timestamp.substring(6, 8);
  const hour = timestamp.substring(8, 10);
  const minute = timestamp.substring(10, 12);
  const second = timestamp.substring(12, 14);
  const milliseconds = timestamp.substring(14);
  return `${year}/${month}/${day}/${hour}${minute}${second}${milliseconds}`;
}


function convertDatePathToTimestamp(datePath) {
  return datePath.replace(/\//g, '').replace(/(\d{4})(\d{2})(\d{2})\/(\d{6})(\d+)/, "$1$2$3$4$5");
}



app.get('/c/:permalink', async (req, res) => {
  let { permalink } = req.params;
  const categoryQuery = 'SELECT * FROM my_keyspace.categories WHERE permalink = ?';

  try {
      const categoryResult = await client.execute(categoryQuery, [permalink], { prepare: true });

      if (categoryResult.rowLength > 0) {
          // Category exists
          const category = categoryResult.first(); // Assuming we get one result since permalink is PRIMARY KEY

          // Now, fetch related posts for this category
          const postsQuery = 'SELECT * FROM my_keyspace.posts WHERE category = ?';
          const postsResult = await client.execute(postsQuery, [permalink], { prepare: true });
          const posts = postsResult.rows;

          // Attach the posts to the category object
          category.posts = posts;

          // Render the category view with the category and its posts
          res.render('category', { category: category });
      } else {
          // Category does not exist
          res.status(404).send('Category not found');
      }
  } catch (error) {
      console.error('Error fetching category and posts:', error);
      res.status(500).send('Internal Server Error');
  }
});





app.get('/p/:category/:uniqueId/:title', async (req, res) => {
  const { category, uniqueId, title } = req.params;
  // Use the parameters to query your Cassandra database for the post data
  // For the sake of example, let's assume you have a function `fetchPostByPostID` that does this
  try {
    const post = await fetchPostByPostID(client,category, uniqueId);
    // Now, render an HTML page using the post data
    // If you're using a templating engine like EJS, Pug, or Handlebars, you can render a template:
    // res.render('postPage', { post: post });

    res.render('postPage', { post: post });



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

function cleanHtmlContent(content) {

  // replace space with empty string
  content = content.replace(/&nbsp;/gi, ' ');

  // trim leading and trailing spaces
  content = content.replace(/(>)[\s]+/g, '$1').replace(/[\s]+(<)/g, '$1');

  // This regex removes tags that contain only whitespace or a single <br> tag, in addition to entirely empty tags
  return content.replace(/<(\w+)(?:\s+[^>]*)?>\s*(<br\s*\/?>)?\s*<\/\1>/g, '');
}

function removeDangerousTags(html) {
  // Remove script tags and their content
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // You can add more lines here to remove other potentially dangerous tags
  // Example: Remove iframe tags
  // html = html.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  
  return html;
}

function removeAllAttributes(html) {
  // This regex looks for HTML tags and attempts to remove attributes inside them
  // Be cautious: this might not work correctly for complex or malformed HTML
  const cleanHtml = html.replace(/<(\w+)(\s+[^>]+)?(>)/g, '<$1$3');
  return cleanHtml;
}




app.post('/api/comment', async (req, res) => {
  let { post_id, content, parent_id } = req.body; // Ensure you receive parent_id if the comment is a reply
  const author = 'username'; // This should ideally come from session or authentication mechanism
  const commentId = generatePostIdTimestamp(); // Generate a unique comment ID

  // Clean the content of empty HTML tags
  content = cleanHtmlContent(content);
  content = removeDangerousTags(content); 
  content = removeAllAttributes(content); 

  console.log(content);
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

   //    await flushAllTables(client,'my_keyspace'); 
      await dropAllTables(client, 'my_keyspace'); 

    await client.connect();
    await createKeyspace(client);

    await createUsersTable(client);
    await createCommentsTable(client);
    await createPostsTable(client);
    await createVotesTable(client);
    await createCategoriesTable(client);

      await populateTestData(client,10);

  } catch (error) {
    console.error('Error:', error);
  }
}



main();
