
async function createKeyspace(client) {
  const query = `
    CREATE KEYSPACE IF NOT EXISTS my_keyspace
    WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};
  `;
  await client.execute(query);
  console.log('Keyspace created or already exists');
}

async function createTables(client) {
  await createUsersTable(client);
  await createCommentsTable(client);
  await createPostsTable(client);
}

async function createUsersTable(client) {
  const query = `
    CREATE TABLE IF NOT EXISTS my_keyspace.users (
      user_id uuid PRIMARY KEY,
      first_name text,
      last_name text,
      email text
    );
  `;
  await client.execute(query);
  console.log('Table `users` created or already exists in `my_keyspace`');
}

async function createCommentsTable(client) {
  const query = `
  CREATE TABLE IF NOT EXISTS my_keyspace.comments (
    comment_id text,
    post_id text,
    author text,
    parent_id text,
    post_type text,
    content text,
    upvotes int,
    downvotes int,
    permalink text,
    timestamp timestamp,
    PRIMARY KEY (post_id, comment_id)
  );
  
  `;
  await client.execute(query);
  console.log('Table `comments` created or already exists in `my_keyspace`');
}


async function createPostsTable(client) {
  const query = `
    CREATE TABLE IF NOT EXISTS my_keyspace.posts (
      post_id text PRIMARY KEY,
      title text,
      author text,
      subreddit text,
      post_type text,
      content text,
      upvotes int,
      downvotes int,
      comment_count int,
      permalink text,
      timestamp timestamp
    );
  `;
  await client.execute(query);
  console.log('Table `posts` created or already exists in `my_keyspace`');
}

async function createVotesTable(client) {
  const query = `
    CREATE TABLE IF NOT EXISTS my_keyspace.votes (
      post_id text,
      ip text,
      is_upvote boolean,
      PRIMARY KEY ((post_id), ip)
    );
  `;
  await client.execute(query);
  console.log('Table `votes` created or already exists in `my_keyspace`');
}


async function flushAllTables(client, keyspace) {
  try {
    // Retrieve all table names within the keyspace
    const queryGetTables = `SELECT table_name FROM system_schema.tables WHERE keyspace_name = ?`;
    const resultTables = await client.execute(queryGetTables, [keyspace], { prepare: true });

    // Iterate over the tables and truncate each
    for (let row of resultTables.rows) {
      const tableName = row['table_name'];
      const queryTruncate = `TRUNCATE ${keyspace}.${tableName}`;
      await client.execute(queryTruncate);
      console.log(`Truncated table: ${tableName}`);
    }

    console.log(`All tables in keyspace '${keyspace}' have been flushed.`);
  } catch (error) {
    console.error('Failed to flush tables', error);
  }
}

async function dropAllTables(client, keyspace) {
  try {
    // Retrieve all table names within the keyspace
    const queryGetTables = `SELECT table_name FROM system_schema.tables WHERE keyspace_name = '${keyspace}'`;
    const resultTables = await client.execute(queryGetTables);

    // Iterate over the tables and drop each
    for (let row of resultTables.rows) {
      const tableName = row['table_name'];
      const queryDropTable = `DROP TABLE IF EXISTS ${keyspace}.${tableName}`;
      await client.execute(queryDropTable);
      console.log(`Dropped table: ${keyspace}.${tableName}`);
    }

    console.log(`All tables in keyspace '${keyspace}' have been dropped.`);
  } catch (error) {
    console.error('Failed to drop tables', error);
  }
}


module.exports = { createKeyspace, createUsersTable,createCommentsTable,createPostsTable,flushAllTables,dropAllTables,createVotesTable };
