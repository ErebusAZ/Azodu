const uuid = require('uuid');
const { faker } = require('@faker-js/faker');

function generateShortId() {
  const timestamp = Date.now().toString(36).substr(-4); // Shorter timestamp
  const randomPart = Math.random().toString(36).substr(2, 5); // Shorter random string
  return `${timestamp}${randomPart}`;
}


function generatePermalink(title, subreddit, postID) {
  // Normalize the title to a URL-friendly string
  const normalizedTitle = title
    .toLowerCase() // convert to lowercase
    .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric chars with -
    .replace(/^-+|-+$/g, ''); // trim - from start and end


  // Combine the normalized title and unique suffix
  const permalink = `/p/${subreddit}/${postID}/${normalizedTitle}`;

  return permalink;
}

async function insertPostData(client, title, author, subreddit, postType, content) {
  // Assuming initial values for upvotes, downvotes, and comment_count are set to 0
  const upvotes = 0;
  const downvotes = 0;
  const commentCount = 0;
  const postID = generateShortId();
  const permalink = generatePermalink(title, subreddit, postID);

  const query = `
    INSERT INTO my_keyspace.posts (
      post_id, title, author, subreddit, post_type, content, upvotes, downvotes, comment_count, permalink, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, toTimestamp(now()));
  `;

  const params = [postID, title, author, subreddit, postType, content, upvotes, downvotes, commentCount, permalink];

  try {
    await client.execute(query, params, { prepare: true });
    console.log('Post data inserted successfully');
  } catch (error) {
    console.error('Failed to insert post data', error);
  }
}

async function insertCategoryData(client, name, creator, description, permalink, dateCreated, moderators) {
  const query = `
    INSERT INTO my_keyspace.categories (
      name, creator, description, permalink, date_created, moderators
    ) VALUES (?, ?, ?, ?, ?, ?);
  `;
  
  const params = [name, creator, description, permalink, dateCreated, moderators];

  try {
    await client.execute(query, params, { prepare: true });
    console.log('Category data inserted successfully');
  } catch (error) {
    console.error('Failed to insert category data', error);
    throw error; // Rethrow the error to be caught by the calling function
  }
}


async function insertCommentData(client, comment_id, post_id, author, parent_id, post_type, content, upvotes, downvotes, permalink, timestamp) {
  const query = `
    INSERT INTO my_keyspace.comments (comment_id, post_id, author, parent_id, post_type, content, upvotes, downvotes, permalink, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  await client.execute(query, [comment_id, post_id, author, parent_id, post_type, content, upvotes, downvotes, permalink, timestamp], { prepare: true });
  
  console.log('Comment inserted. ID is ' + comment_id);
  console.log('post_id is' + post_id); 
}




async function populateTestData(client, numberOfPosts = 100) {
  for (let i = 0; i < numberOfPosts; i++) {
    const title = faker.lorem.sentence();
    const author = faker.internet.userName();
    const subredditOptions = ['subreddit1', 'subreddit2', 'subreddit3'];
    const subreddit = subredditOptions[Math.floor(Math.random() * subredditOptions.length)];
    const postTypeOptions = ['text', 'url'];
    const postType = postTypeOptions[Math.floor(Math.random() * postTypeOptions.length)];
    const content = postType === 'text' ? faker.lorem.paragraph() : faker.internet.url();
    const permalink = faker.internet.url();

    await insertPostData(client, title, author, subreddit, postType, content);
  }

  console.log(`${numberOfPosts} test posts inserted successfully.`);
}

async function insertUserData() {
  // Ensure you connect to the 'my_keyspace' keyspace
  const query = `INSERT INTO my_keyspace.users (user_id, first_name, last_name, email) VALUES (uuid(), ?, ?, ?)`;

  // Example user data
  const params = ['John', 'Doe', 'john.doe@example.com'];

  try {
    await client.execute(query, params, { prepare: true });
    console.log('User data inserted successfully');
  } catch (error) {
    console.error('Failed to insert user data', error);
  }
}


async function insertVote(client, post_id, isUpvote, ip) {

  const query = `
    INSERT INTO my_keyspace.votes (post_id, ip, is_upvote)
    VALUES (?, ?, ?);
  `;

  const params = [post_id, ip, isUpvote];

  try {
    await client.execute(query, params, { prepare: true });
  //  console.log('Vote recorded successfully');
  } catch (error) {
    console.error('Error inserting vote:', error);
  }
}





module.exports = { insertPostData, insertUserData, populateTestData, insertVote,insertCommentData,generateShortId,insertCategoryData,generatePermalink };
