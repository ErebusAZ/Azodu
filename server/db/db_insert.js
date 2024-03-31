const uuid = require('uuid');
const { faker } = require('@faker-js/faker');

let postIdIterator = 0; // if we generate 50 posts in the same function, this will make sure the post_id/timestamps are unique

function generatePostIdTimestamp() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0'); // getUTCMonth() returns 0-11
    const day = String(now.getUTCDate()).padStart(2, '0');
    const hour = String(now.getUTCHours()).padStart(2, '0');
    const minute = String(now.getUTCMinutes()).padStart(2, '0');
    const second = String(now.getUTCSeconds()).padStart(2, '0');
    const millisecond = String(now.getUTCMilliseconds()).padStart(3, '0');

    // Ensure the iterator is always at least two digits, resetting if it exceeds 99
    const iterator = String(postIdIterator++ % 100).padStart(2, '0');
    
    // Concatenate all parts to form the ID, including the iterator
    const timestampId = `${year}${month}${day}${hour}${minute}${second}${millisecond}${iterator}`;
    return timestampId;
}


function generatePermalink(title, category, postID) {
  // Normalize the title to a URL-friendly string
  const normalizedTitle = title
    .toLowerCase() // convert to lowercase
    .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric chars with -
    .replace(/^-+|-+$/g, ''); // trim - from start and end


  // Combine the normalized title and unique suffix
  const permalink = `/c/${category}/${postID}/${normalizedTitle}`;

  return permalink;
}

async function insertPostData(client, title, author, category, postType, content, thumbnail) {
  const upvotes = 0;
  const downvotes = 0;
  const commentCount = 0;
  const postID = generatePostIdTimestamp();
  const permalink = generatePermalink(title, category, postID);

  const query = `
    INSERT INTO my_keyspace.posts (
      post_id, title, author, category, post_type, content, upvotes, downvotes, comment_count, permalink, thumbnail, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, toTimestamp(now()));
  `;

  const params = [postID, title, author, category, postType, content, upvotes, downvotes, commentCount, permalink, thumbnail];

  try {
    await client.execute(query, params, { prepare: true });
    console.log('Post data inserted successfully with thumbnail');
  } catch (error) {
    console.error('Failed to insert post data with thumbnail', error);
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

async function updateCommentData(client, comment_id, newContent, post_id) {
  const query = `
    UPDATE my_keyspace.comments
    SET content = ?
    WHERE comment_id = ? AND post_id = ?`;
  await client.execute(query, [newContent, comment_id.toString(), post_id.toString()], { prepare: true });

  console.log('Comment updated. ID is ' + comment_id + ' for post ID ' + post_id);
}

async function deleteCommentData(client, comment_id, post_id) {
  const query = `
      DELETE FROM my_keyspace.comments
      WHERE comment_id = ? AND post_id = ?`;
  await client.execute(query, [comment_id.toString(), post_id.toString()], { prepare: true });

  console.log('Comment deleted. ID was ' + comment_id + ' for post ID ' + post_id);
}




async function populateTestData(client, numberOfPosts = 100) {
  for (let i = 0; i < numberOfPosts; i++) {
    const title = faker.lorem.sentence();
    const author = faker.internet.userName();
    const categoryOptions = ['category1', 'category2', 'category3'];
    const category = 'everything';
    const postTypeOptions = ['text', 'url'];
    const postType = postTypeOptions[Math.floor(Math.random() * postTypeOptions.length)];
    const content = postType === 'text' ? faker.lorem.paragraph() : faker.internet.url();
    const permalink = faker.internet.url();

    await insertPostData(client, title, author, category, postType, content);
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


async function tallyVotesForComment(client, post_id, comment_id,) {
  // Assume entityId is comment_id for comments and post_id for posts
  const votesQuery = `SELECT is_upvote FROM my_keyspace.votes WHERE post_id = ?`;
  const votesResult = await client.execute(votesQuery, [comment_id], { prepare: true });
  const votes = votesResult.rows;

  let upvotes = 0;
  let downvotes = 0;
  votes.forEach(vote => {
    vote.is_upvote ? upvotes++ : downvotes++;
  });

  const updateQuery = `UPDATE my_keyspace.comments SET upvotes = ?, downvotes = ? WHERE post_id = ? AND comment_id = ?`;
  await client.execute(updateQuery, [upvotes, downvotes, post_id, comment_id], { prepare: true });

 // console.log(`Updated votes for entity ${comment_id}: ${upvotes} upvotes, ${downvotes} downvotes`);
}





module.exports = { insertPostData, insertUserData, populateTestData, insertVote,insertCommentData,generatePostIdTimestamp,insertCategoryData,generatePermalink,updateCommentData,tallyVotesForComment,deleteCommentData };
