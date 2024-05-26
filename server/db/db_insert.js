const uuid = require('uuid');
const os = require('os');
const { v1: uuidv1 } = require('uuid');
const { types } = require('cassandra-driver');


const { faker } = require('@faker-js/faker');

let postIdIterator = 0; // if we generate 50 posts in the same function, this will make sure the post_id/timestamps are unique



function getServerIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return '0.0.0.0'; // Fallback if no external IP found
}



function generateContentId() {
  return types.TimeUuid.fromDate(new Date(), uuidv1()).toString();

}



function generateCommentUUID() {
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

function sanitizeLink(link) {
  // Remove URL parameters to prevent bypassing uniqueness with query strings
  const url = new URL(link, 'http://example.com'); // Base URL is needed for relative links; it won't affect absolute URLs
  return url.origin + url.pathname;
}

async function getNextPostId(client) {
  const updateQuery = `UPDATE azodu_keyspace.post_id_counter SET id_counter = id_counter + 1 WHERE id_name = 'postID'`;
  const selectQuery = `SELECT id_counter FROM azodu_keyspace.post_id_counter WHERE id_name = 'postID'`;

  try {
    // Increment the counter
    await client.execute(updateQuery);

    // Fetch the updated counter value
    const result = await client.execute(selectQuery);
    if (result.rowLength > 0) {
      const newId = result.first()['id_counter'].toString();
      return newId;
    } else {
      throw new Error('Failed to fetch updated post ID counter.');
    }
  } catch (error) {
    console.error('Error getting next post ID:', error);
    throw error; // Rethrow to handle it in the calling function
  }
}

async function insertPostData(client, title, author, category, postType, content, thumbnail, aiSummary = '', skipLinkCheck, postID = null, isEdit = false) {
  if (!title || !author || !category || !postType || (postType === 'url' && !content)) {
    throw new Error('Missing required post data.');
  }

  const sanitizedLink = postType === 'url' ? sanitizeLink(content) : content;
  const timestamp = new Date();

  if (!postID) postID = generateContentId();  // Generate new postID if not editing
  const permalink = generatePermalink(title, category, postID);

  if (postType === 'url' && !skipLinkCheck) {
    const linkExistsQuery = 'SELECT link FROM azodu_keyspace.links WHERE link = ? AND category = ?';
    const linkExistsResult = await client.execute(linkExistsQuery, [sanitizedLink, category], { prepare: true });
    if (linkExistsResult.rowLength > 0 && !isEdit) {
      throw new Error('The link was already posted to this category.');
    }

    if (!isEdit) {
      const insertLinkQuery = 'INSERT INTO azodu_keyspace.links (link, category, post_id, timestamp) VALUES (?, ?, ?, ?)';
      await client.execute(insertLinkQuery, [sanitizedLink, category, postID, timestamp], { prepare: true });
    }
  }

  if (!isEdit) {
    // Insert new post
    const query = `
      INSERT INTO azodu_keyspace.posts (
        post_id, title, author, category, post_type, content, ai_summary, permalink, thumbnail, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, toTimestamp(now()));
    `;
    const params = [postID, title, author, category, postType, sanitizedLink, aiSummary, permalink, thumbnail];
    
    try {
      await client.execute(query, params, { prepare: true });
    } catch (error) {
      console.error('Failed to insert new post data', error);
      throw new Error('Database insertion failed.');
    }
  } else {
    // Update existing post
    const updateQuery = `
      UPDATE azodu_keyspace.posts
      SET content = ?
      WHERE post_id = ? AND category = ?;
    `;
    const updateParams = [content, postID,category];

    try {
      await client.execute(updateQuery, updateParams, { prepare: true });
    } catch (error) {
      console.error('Failed to update post data', error);
      throw new Error('Database update failed.');
    }
  }

  return { postID, permalink };  // Return postID and permalink after successful operation
}





async function savePostForUser(client, username, post_id, category) {
  const query = `
    INSERT INTO azodu_keyspace.user_saved_posts (
      username, post_id, category, saved_timestamp
    ) VALUES (?, ?, ?, toTimestamp(now()));
  `;

  const params = [username, post_id, category];

  try {
    await client.execute(query, params, { prepare: true });
    console.log('Saved post for user successfully');
  } catch (error) {
    console.error('Failed to save post for user', error);
    throw error; // Rethrow the error to be caught by the calling function
  }
}



async function saveCommentForUser(client, username, commentId, postId) {
  const query = `
    INSERT INTO azodu_keyspace.user_saved_comments (username, comment_id, post_id, saved_timestamp)
    VALUES (?, ?, ?, toTimestamp(now()));
  `;
  await client.execute(query, [username, commentId, postId], { prepare: true });
}


async function unsaveCommentForUser(client, username, commentId) {
  const query = `
    DELETE FROM azodu_keyspace.user_saved_comments
    WHERE username = ? AND comment_id = ?;
  `;
  try {
    await client.execute(query, [username, commentId], { prepare: true });
    console.log('Comment unsaved successfully.');
  } catch (error) {
    console.error('Error unsaving comment:', error);
    throw error; // Rethrow or handle as needed
  }
}


async function insertCategoryData(client, name, creator, description, permalink, dateCreated, moderators) {
  // Include the `subscribers` field in your INSERT query and set it to 0 initially
  const query = `
    INSERT INTO azodu_keyspace.categories (
      name, creator, description, permalink, date_created, moderators, subscribers
    ) VALUES (?, ?, ?, ?, ?, ?, ?); // Include the subscribers placeholder
  `;

  // Include 0 for the `subscribers` field in your params array
  const params = [name, creator, description, permalink, dateCreated, moderators, 0];

  try {
    await client.execute(query, params, { prepare: true });
    console.log('Category data inserted successfully with 0 subscribers.');
  } catch (error) {
    console.error('Failed to insert category data', error);
    throw error; // Rethrow the error to be caught by the calling function
  }
}


async function insertCommentData(client, comment_id, post_id, author, parent_id, post_type, content, upvotes, downvotes, permalink, timestamp) {
  const query = `
    INSERT INTO azodu_keyspace.comments (comment_id, post_id, author, parent_id, post_type, content, upvotes, downvotes, permalink, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  await client.execute(query, [comment_id, post_id, author, parent_id, post_type, content, upvotes, downvotes, permalink, timestamp], { prepare: true });


}

async function updateCommentData(client, comment_id, newContent, post_id) {
  const query = `
    UPDATE azodu_keyspace.comments
    SET content = ?
    WHERE comment_id = ? AND post_id = ?`;
  await client.execute(query, [newContent, comment_id.toString(), post_id.toString()], { prepare: true });

  console.log('Comment updated. ID is ' + comment_id + ' for post ID ' + post_id);
}

async function deleteCommentData(client, comment_id, post_id) {
  const query = `
      DELETE FROM azodu_keyspace.comments
      WHERE comment_id = ? AND post_id = ?`;
  await client.execute(query, [comment_id.toString(), post_id.toString()], { prepare: true });

  console.log('Comment deleted. ID was ' + comment_id + ' for post ID ' + post_id);
}




async function populateTestData(client, numberOfPosts = 100) {
  for (let i = 0; i < numberOfPosts; i++) {
    const title = faker.lorem.sentence();
    const author = faker.internet.userName();
    const categoryOptions = ['category1', 'category2', 'category3'];
    const category = 'anything';
    const postTypeOptions = ['text', 'url'];
    const postType = postTypeOptions[Math.floor(Math.random() * postTypeOptions.length)];
    const content = postType === 'text' ? faker.lorem.paragraph() : faker.internet.url();
    const permalink = faker.internet.url();

    await insertPostData(client, title, author, category, postType, content);
  }

  console.log(`${numberOfPosts} test posts inserted successfully.`);
}



async function insertOrUpdateVote(client, post_id, voteValue, ip) {
  const query = `
    INSERT INTO azodu_keyspace.votes (post_id, ip, vote_value)
    VALUES (?, ?, ?)
  `;

  const params = [post_id, ip, voteValue];

  try {
    await client.execute(query, params, { prepare: true });
    console.log('Vote recorded or updated successfully');
  } catch (error) {
    console.error('Error inserting or updating vote:', error);
  }
}



async function tallyVotesForComment(client, post_id, comment_id) {
  // Fetch the vote values for the specified comment_id
  const votesQuery = `SELECT vote_value FROM azodu_keyspace.votes WHERE post_id = ?`;
  const votesResult = await client.execute(votesQuery, [comment_id], { prepare: true });
  const votes = votesResult.rows;

  let upvotes = 0;
  let downvotes = 0;
  votes.forEach(vote => {
    if (vote.vote_value === 1) {
      upvotes++;  // Increment for each upvote
    } else if (vote.vote_value === -1) {
      downvotes++;  // Increment for each downvote
    } else if (vote.vote_value > 1) {
      upvotes += vote.vote_value; 

    }
    // Note: vote_value of 0 does not affect counts
  });

  // Update the comment's upvote and downvote counts in the database
  const updateQuery = `UPDATE azodu_keyspace.comments SET upvotes = ?, downvotes = ? WHERE post_id = ? AND comment_id = ?`;
  await client.execute(updateQuery, [upvotes, downvotes, post_id, comment_id], { prepare: true });

//  console.log(`Updated votes for comment ${comment_id}: ${upvotes} upvotes, ${downvotes} downvotes`);
}





module.exports = { insertPostData, populateTestData, insertCommentData, generateCommentUUID, generateContentId,insertCategoryData, generatePermalink, updateCommentData, tallyVotesForComment, deleteCommentData,savePostForUser,saveCommentForUser,unsaveCommentForUser,insertOrUpdateVote };
