const express = require('express');
const bodyParser = require('body-parser');
const cassandra = require('cassandra-driver');
const uuid = require('uuid');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');


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
const { insertPostData, populateTestData, insertVote,insertCommentData,generatePostIdTimestamp,insertCategoryData,updateCommentData,tallyVotesForComment,deleteCommentData } = require('./db/db_insert');
const { fetchPostByPostID,fetchPostsAndCalculateVotes,getCommentDetails } = require('./db/db_query');


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
const defaultCategories = ["everything"];


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
        expiresIn: 86400, // 24 hours
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

      const passwordIsValid = await bcrypt.compare(password, user.password);
      if (!passwordIsValid) {
        return res.status(200).json({ message: 'Incorrect password.' });
      }

      const token = jwt.sign({ username: user.username }, jwtSecret, {
        expiresIn: 86400, // 24 hours
      });

      res.status(200).json({ auth: true, token: token, message: 'Login successful.' });
    } else {
      res.status(200).json({ message: 'No user found.' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in.' });
  }
});




app.post('/submitPost', authenticateToken, async (req, res) => {
  const creator = req.user.username; 
  
  const { title, category, postType, contentText, contentUrl } = req.body;
  const content = postType === 'text' ? contentText : contentUrl;

  try {
    await insertPostData(client, title, creator, category, postType, processHTMLFromUsers(content));
    // Instead of redirecting, send a JSON response indicating success
    res.status(200).json({ message: 'Post submitted successfully' });
  } catch (error) {
    console.error('Error submitting post:', error);
    // Send a JSON response indicating an error
    res.status(500).json({ message: 'Failed to submit post' });
  }
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
          const postsQuery = 'SELECT * FROM my_keyspace.posts WHERE category = ? LIMIT 30';
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


app.get('/', async (req, res) => {


  res.render('index');


}); 


app.get('/submit-category/', async (req, res) => {


  res.render('submitCategory');


}); 

app.get('/submit-post/', async (req, res) => {


  res.render('submitPost');


}); 


app.get('/c/:category/:uniqueId/:title', async (req, res) => {
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

function validateComment(content) {

  const minLength = 15;
  const maxLength = 60000;

  // Trim whitespace from start and end of the comment content
  const trimmedContent = content.trim();

  // Check for empty content or content that only has spaces or tab characters
  if (!trimmedContent) {
      return { isValid: false, message: "Comment cannot be empty." };
  }


  // Check for content length below minimum
  if (trimmedContent.length < minLength) {
      return { isValid: false, message: `Comment must be at least ${minLength} characters long.` };
  }

  // Check for content length exceeding maximum
  if (trimmedContent.length > maxLength) {
      return { isValid: false, message: `Comment must not exceed ${maxLength} characters.` };
  }

  const unsubstantiveTexts = [
      "hi", "hello", "hey",
      "thanks", "thank you", "thx",
      "good", "great", "nice", "ok", "okay",
      "lol", "haha", "hehe", "cool",
      "yes", "no",
      "yep", "nope",
      "wow", "omg", "ugh",
      "hmm", "meh",
      "yay", "nah",
      "pls", "please",
      "bye", "goodbye", "see ya",
      "idk", "imo", "imho", "fyi",
      "brb", "gtg",
      "k", "kk",
      "👍", "👎", "😂", "😍", "😭", "😊", "😒", "😉", "😜", "🙄",  // Including common emojis as they might also be considered insubstantial alone
  ];


  // Check for unsubstantive text content
  if (unsubstantiveTexts.includes(trimmedContent.toLowerCase())) {
      return { isValid: false, message: "Comment is too short or unsubstantive." };
  }

  // Additional checks can be added here, such as checking for invalid characters,
  // overly repetitive text, or other criteria as deemed necessary.

  // If the content passes all checks
  return { isValid: true, message: "" };
}


function processHTMLFromUsers(content) {
  if (!content) {
      return content;
  }

  function cleanHtmlContent(content) {

    // replace space with empty string
    content = content.replace(/&nbsp;/gi, ' ');

    // trim leading and trailing spaces
    // causes spaces removed around links
    // content = content.replace(/(>)[\s]+/g, '$1').replace(/[\s]+(<)/g, '$1');

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

  function removeAllAttributesExceptLinks(html) {
    // This regex looks for HTML tags that are not <a> and attempts to remove attributes inside them
    // It will leave <a href="..."> tags untouched
    const cleanHtml = html.replace(/<((?!a\b)\w+)(\s+[^>]+)?(>)/g, '<$1$3');
    return cleanHtml;
  }

  // Step 1: Clean the content (if needed, like removing &nbsp; or empty tags)
  content = cleanHtmlContent(content);

  // Step 2: Remove dangerous tags like <script>
  content = removeDangerousTags(content);

  // Step 3: Keep only <a> tags with href and optionally target="_blank", remove all other attributes
  content = content.replace(/<a\b[^>]*>/gi, function (match) {
    const hrefMatch = match.match(/\bhref="[^"]*"/i);
    const targetMatch = match.match(/\btarget="_blank"/i);
    return `<a ${hrefMatch ? hrefMatch[0] : ''} ${targetMatch ? targetMatch[0] : ''}>`;
  });

  // Step 4: Remove attributes from all other tags
  content = removeAllAttributesExceptLinks(content);

  return content;
}





app.post('/api/comment', authenticateToken, async (req, res) => {
    let { post_id, content, parent_id, isEdit, commentId, isDelete } = req.body;
  const author = req.user.username; // Ideally, this comes from the session or authentication mechanism
  
  if (!validateComment(content).isValid)
    return; 

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
    }
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
 //    await dropAllTables(client, 'my_keyspace'); 

    await client.connect();
    await createKeyspace(client);

    await createUsersTable(client);
    await createCommentsTable(client);
    await createPostsTable(client);
    await createVotesTable(client);
    await createCategoriesTable(client);

  //  await populateTestData(client, 100);

 
  //  await createDefaultCategories(client,defaultCategories);


  } catch (error) {
    console.error('Error:', error);
  }
}



main();
