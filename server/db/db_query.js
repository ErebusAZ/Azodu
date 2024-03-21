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

async function fetchPostByPostID(client, post_id) {
  const postQuery = 'SELECT * FROM posts WHERE post_id = ?';
  const commentsQuery = 'SELECT * FROM comments WHERE post_id = ?';
  
  try {
    // Fetch the post
    const postResult = await client.execute(postQuery, [post_id], { prepare: true });
    if (postResult.rows.length > 0) {
      const post = postResult.rows[0];
      
      // Fetch comments for the post
      const commentsResult = await client.execute(commentsQuery, [post_id], { prepare: true });
      const comments = commentsResult.rows;

      // Add comments array to post object
      post.comments = comments;
      
      return post;
    } else {
      return null; // No post found with this post_id
    }
  } catch (error) {
    console.error('Error fetching post by post_id', error);
    throw error;
  }
}


async function fetchPostsAndCalculateVotes(client,postsVoteSummary) {
  try {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const fetchPostsQuery = `SELECT * FROM my_keyspace.posts WHERE timestamp > ? ALLOW FILTERING`;
    const posts = await client.execute(fetchPostsQuery, [fortyEightHoursAgo], { prepare: true });

    for (const post of posts.rows) {
      const fetchVotesQuery = `SELECT is_upvote FROM my_keyspace.votes WHERE post_id = ?`;
      const votes = await client.execute(fetchVotesQuery, [post.post_id], { prepare: true });

      let upvotes = 0;
      let downvotes = 0;
      votes.rows.forEach(vote => {
        if (vote.is_upvote) {
          upvotes++;
        } else {
          downvotes++;

        }
      });

      postsVoteSummary[post.post_id] = {
        ...post,
        upvotes,
        downvotes,
        total_votes: upvotes - downvotes
      };
    }

  //  console.log('Posts and vote summary updated.');
  } catch (error) {
    console.error('Error fetching posts and calculating votes:', error);
  }

  return postsVoteSummary; 
}



module.exports = { queryAndLogUserData,fetchPostByPostID,fetchPostsAndCalculateVotes };
