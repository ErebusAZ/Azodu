async function queryAndLogUserData() {
  const query = 'SELECT * FROM my_keyspace.users';

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
  const postQuery = 'SELECT * FROM my_keyspace.posts WHERE category = ? AND post_id = ?';
  
  // Assuming comments are also stored by post_id and do not require category for retrieval
  const commentsQuery = 'SELECT * FROM my_keyspace.comments WHERE post_id = ?';
  
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


async function fetchPostsAndCalculateVotes(client, category, postsVoteSummary, updateDb = true) {
  try {
    // Fetch the latest posts within the category. Adjust the limit as needed.
    const fetchPostsQuery = `SELECT * FROM my_keyspace.posts WHERE category = ? LIMIT 50`;

    const posts = await client.execute(fetchPostsQuery, [category], { prepare: true });

    for (const post of posts.rows) {
      const fetchVotesQuery = `SELECT is_upvote FROM my_keyspace.votes WHERE post_id = ?`;
      const votes = await client.execute(fetchVotesQuery, [post.post_id], { prepare: true });

      let upvotes = 0;
      let downvotes = 0;
      votes.rows.forEach(vote => {
        if (vote.is_upvote) upvotes++;
        else downvotes++;
      });

      // Update the in-memory postsVoteSummary object
      postsVoteSummary[post.post_id] = {
        ...post,
        upvotes: upvotes,
        downvotes: downvotes,
        total_votes: upvotes - downvotes
      };

      // Optionally update the database
      if (updateDb) {
        const updatePostQuery = `
          UPDATE my_keyspace.posts
          SET upvotes = ?, downvotes = ?
          WHERE category = ? AND post_id = ?;
        `;
        await client.execute(updatePostQuery, [upvotes, downvotes, category, post.post_id], { prepare: true });
      }
    }

    console.log(`Posts and vote summary updated for category: ${category}.`);
  } catch (error) {
    console.error(`Error fetching posts and calculating votes for category: ${category}`, error);
  }

  return postsVoteSummary;
}



module.exports = { queryAndLogUserData,fetchPostByPostID,fetchPostsAndCalculateVotes };
