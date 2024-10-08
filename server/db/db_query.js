const { types } = require('cassandra-driver');





function isCacheValid(lastFetched,ttl) {
  return (new Date() - lastFetched) < ttl;
}



async function fetchCategoryByName(client, permalink,cache) {
  // Check if category is in cache and valid
  if (cache.category.permalinks[permalink] && isCacheValid(cache.category.permalinks[permalink].lastFetched, cache.category.ttl)) {
  //  console.log('Serving category from cache');
    return cache.category.permalinks[permalink].data;
  } else {
   // console.log('serving cat not from cache');
  }

  const categoryQuery = 'SELECT * FROM azodu_keyspace.categories WHERE permalink = ?';
  try {
      const categoryResult = await client.execute(categoryQuery, [permalink], { prepare: true });

      if (categoryResult.rowLength > 0) {
          const category = categoryResult.first();
          const postsQuery = 'SELECT * FROM azodu_keyspace.posts WHERE category = ? LIMIT 30';
          const postsResult = await client.execute(postsQuery, [permalink], { prepare: true });
          category.posts = postsResult.rows;

          // Cache the category data with current timestamp
          cache.category.permalinks[permalink] = {
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







async function queryAndLogUserData() {
  const query = 'SELECT * FROM azodu_keyspace.users';

  try {
    const result = await client.execute(query);
    console.log('Query executed successfully. Retrieved users:');
    result.rows.forEach(row => {
      console.log(`User ID: ${row.user_id}, First Name: ${row.first_name}, Last Name: ${row.last_name}, Email: ${row.email}`);
    });
  } catch (error) {
    console.error('Failed to query user data', error);
  }
}

async function fetchPostByPostID(client, category, post_id) {
  // Adjusted to include the category in the query for posts
  const postQuery = 'SELECT * FROM azodu_keyspace.posts WHERE category = ? AND post_id = ?';
  
  // Assuming comments are also stored by post_id and do not require category for retrieval
  const commentsQuery = 'SELECT * FROM azodu_keyspace.comments WHERE post_id = ?';
  
  try {
    // Fetch the post using both category and post_id
    const postResult = await client.execute(postQuery, [category, post_id], { prepare: true });
    if (postResult.rows.length > 0) {
      const post = postResult.rows[0];
      
      // Fetch comments for the post
      const commentsResult = await client.execute(commentsQuery, [post_id], { prepare: true });
      const comments = commentsResult.rows;

      // Add comments array to post object
      post.comments = comments;
      
      return post;
    } else {
      return null; // No post found with this category and post_id
    }
  } catch (error) {
    console.error(`Error fetching post by category '${category}' and post_id '${post_id}'`, error);
    throw error;
  }
}

function isPostOlderThanDays(postId, days) {
  const postTimestamp = types.TimeUuid.fromString(postId).getDate();
  const postAgeDays = (Date.now() - postTimestamp) / (1000 * 60 * 60 * 24);
  return postAgeDays > days;
}



async function fetchPostsAndCalculateVotesAndCommentCounts(client, category, categoryInPostsCache, updateDb = true, postLimit,numDaysPostsExpire) {
  try {

    const maxCacheSize = postLimit * 2; 
    // Fetch the latest posts within the category. Adjust the limit as needed.
    const fetchPostsQuery = `SELECT * FROM azodu_keyspace.posts WHERE category = ? LIMIT ` + postLimit;
    const posts = await client.execute(fetchPostsQuery, [category], { prepare: true });
    const fiveDaysAgo = new Date(Date.now() - numDaysPostsExpire * 24 * 60 * 60 * 1000);

    // Filter posts based on the timeuuid and specified days
    posts.rows = posts.rows.filter(post => !isPostOlderThanDays(post.post_id.toString(), numDaysPostsExpire));

    
    // Check and manage cache size
    let cacheKeys = Object.keys(categoryInPostsCache);
    if (cacheKeys.length >= maxCacheSize) {
      // Sort keys by their last accessed time, stored in cache as part of the object
      cacheKeys.sort((a, b) => categoryInPostsCache[a].lastAccessed - categoryInPostsCache[b].lastAccessed);
      // Remove the oldest item(s) as needed to make room
      while (cacheKeys.length >= maxCacheSize) {
        const oldestKey = cacheKeys.shift();
        delete categoryInPostsCache[oldestKey];
      }
    }



    for (const post of posts.rows) {
      // Fetch votes and calculate upvotes and downvotes
      const fetchVotesQuery = `SELECT vote_value FROM azodu_keyspace.votes WHERE post_id = ?`;
      const votes = await client.execute(fetchVotesQuery, [post.post_id], { prepare: true });

      let upvotes = 0;
      let downvotes = 0;
      votes.rows.forEach(vote => {
        if (vote.vote_value === 1) upvotes++;
        else if (vote.vote_value === -1) downvotes++;
        else if (vote.vote_value > 1) upvotes += vote.vote_value;
      });

      // Fetch comments count for the post
      const fetchCommentsCountQuery = `SELECT COUNT(*) AS comment_count FROM azodu_keyspace.comments WHERE post_id = ?`;
      const commentsCountResult = await client.execute(fetchCommentsCountQuery, [post.post_id], { prepare: true });
      const commentCount = commentsCountResult.first()['comment_count'] || 0;

      if (categoryInPostsCache[post.post_id]) {
  
     //   console.log('post already exists! ' + post.post_id);
      } else {

      //  console.log(post.post_id + ' does not exist'); 
      }


      // Update the in-memory categoryInPostsCache object
      categoryInPostsCache[post.post_id] = {
        ...post,
        upvotes: upvotes,
        downvotes: downvotes,
        total_votes: upvotes - downvotes,
        comment_count: commentCount, // Add comment count to summary
      };

      // Optionally update the database
      if (updateDb) {
        const updatePostQuery = `
          UPDATE azodu_keyspace.posts
          SET upvotes = ?, downvotes = ?, comment_count = ?
          WHERE category = ? AND post_id = ?;
        `;
        await client.execute(updatePostQuery, [upvotes, downvotes, commentCount, category, post.post_id], { prepare: true });
      }
    }

  //  console.log(`Posts and vote summary updated for category: ${category}.`);
  } catch (error) {
    console.error(`Error fetching posts and calculating votes for category: ${category}`, error);
  }

  return categoryInPostsCache;
}



async function getCommentDetails(client, post_id, comment_id) {
  // Use both post_id and comment_id to uniquely identify the comment
  const query = `
    SELECT * FROM azodu_keyspace.comments
    WHERE post_id = ? AND comment_id = ?`;
  const result = await client.execute(query, [post_id.toString(), comment_id.toString()], { prepare: true });

  if (result.rows.length > 0) {
    return result.rows[0]; // Assuming the first row contains the needed comment details
  } else {
    throw new Error('Comment not found');
  }
}




module.exports = { queryAndLogUserData,fetchPostByPostID,fetchPostsAndCalculateVotesAndCommentCounts,getCommentDetails,fetchCategoryByName,isPostOlderThanDays,isCacheValid};
