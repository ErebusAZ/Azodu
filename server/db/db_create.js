
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
      username text PRIMARY KEY,
      password text,
      email text,
      date_registered timestamp,
      subscriptions set<text>,
      roles set<text>, // Adjusted to set<text> for multiple roles
      last_ip text // Field for storing the last known IP address
    );
  `;
  try {
    await client.execute(query);
    console.log('Table `users` created or already exists in `my_keyspace`');
  } catch (error) {
    console.error('Error creating users table:', error);
  }
}

function getRandomDate(startDate, endDate) {
  return new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime()));
}

async function createUserSavedPostsTable(client) {
  const query = `
    CREATE TABLE IF NOT EXISTS my_keyspace.user_saved_posts (
      username text,
      post_id text,
      saved_timestamp timestamp,
      PRIMARY KEY ((username), post_id)
    ) WITH CLUSTERING ORDER BY (post_id DESC);
  `;

  try {
    await client.execute(query);
    console.log('Table `user_saved_posts` created or already exists in `my_keyspace`');
  } catch (error) {
    console.error('Error creating table `user_saved_posts`:', error);
    throw error; // Rethrow the error to be caught by the calling function
  }
}



async function insertFakeUsers(client, usernames) {
  const baseEmail = "user@example.com";
  const password = "password"; // Consider using hashed passwords in real applications

  // Define the start and end dates for the random date generation (e.g., the past few weeks)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 21); // 3 weeks ago

  for (const username of usernames) {
    // Generate a random date for each user
    const randomDate = getRandomDate(startDate, endDate).toISOString();

    const query = `
      INSERT INTO my_keyspace.users (username, password, email, date_registered, subscriptions, roles, last_ip)
      VALUES (?, ?, ?, ?, {'default'}, {'user'}, '127.0.0.1');
    `;

    try {
      await client.execute(query, [username, password, `${username}@${baseEmail}`, randomDate], { prepare: true });
   //   console.log(`Inserted fake user: ${username}`);
    } catch (error) {
      console.error(`Error inserting fake user ${username}:`, error);
    }
  }
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


async function createMaterializedViews(client) {
  await createCommentsByAuthorView(client);
  await createPostsByAuthorView(client);
}

async function createCommentsByAuthorView(client) {
  const query = `
  CREATE MATERIALIZED VIEW IF NOT EXISTS my_keyspace.comments_by_author AS
  SELECT *
  FROM my_keyspace.comments
  WHERE author IS NOT NULL AND comment_id IS NOT NULL AND post_id IS NOT NULL
  PRIMARY KEY ((author), comment_id, post_id)
  WITH CLUSTERING ORDER BY (comment_id DESC, post_id DESC);
  
  `;
  try {
    await client.execute(query);
    console.log('Materialized view `comments_by_author` created or already exists');
  } catch (error) {
    console.error('Error creating materialized view `comments_by_author`:', error);
  }
}


async function createPostsByAuthorView(client) {
  const query = `
  CREATE MATERIALIZED VIEW IF NOT EXISTS my_keyspace.posts_by_author AS
  SELECT *
  FROM my_keyspace.posts
  WHERE author IS NOT NULL AND post_id IS NOT NULL AND category IS NOT NULL
  PRIMARY KEY ((author), category, post_id)
  WITH CLUSTERING ORDER BY (category ASC, post_id DESC);
  
  `;
  try {
    await client.execute(query);
    console.log('Materialized view `posts_by_author` created or already exists');
  } catch (error) {
    console.error('Error creating materialized view `posts_by_author`:', error);
  }
}



async function createPostsTable(client) {
  const query = `
  CREATE TABLE IF NOT EXISTS my_keyspace.posts (
    category text,
    post_id text,
    title text,
    author text,
    post_type text,
    content text,
    ai_summary text,
    upvotes int,
    downvotes int,
    comment_count int,
    permalink text,
    timestamp timestamp,
    thumbnail text,
    PRIMARY KEY (category, post_id)
  ) WITH CLUSTERING ORDER BY (post_id DESC);  
  `;
  await client.execute(query);
  console.log('Table `posts` created or already exists in `my_keyspace`');
}


async function createPostIdCounterTable(client) {
  const query = `
    CREATE TABLE IF NOT EXISTS my_keyspace.post_id_counter (
      id_name text PRIMARY KEY,
      id_counter counter
    );
  `;
  try {
    await client.execute(query);
    console.log('Post ID counter table created successfully.');
  } catch (error) {
    console.error('Failed to create post ID counter table:', error);
  }
}


async function createLinksTable(client) {
  const query = `
    CREATE TABLE IF NOT EXISTS my_keyspace.links (
      link text,
      category text,
      post_id text,
      timestamp timestamp,
      PRIMARY KEY ((link, category))
    );
  `;
  await client.execute(query);
  console.log('Table `links` updated in `my_keyspace` with `link` and `category` as primary keys and including a `timestamp`.');
}


async function createCategoriesTable(client) {
  const query = `
  CREATE TABLE IF NOT EXISTS my_keyspace.categories (
    permalink text,
    name text,
    creator text,
    description text,
    date_created timestamp,
    moderators text,
    isDefault boolean,
    PRIMARY KEY (permalink, date_created)
  ) WITH CLUSTERING ORDER BY (date_created DESC);  
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


async function createDefaultCategories(client, defaultCategories) {
  // Query to check if a category with the same permalink already exists
  const queryCheckExists = `
    SELECT permalink FROM my_keyspace.categories WHERE permalink = ? LIMIT 1;
  `;

  // Your existing INSERT query remains unchanged
  const queryInsertCategory = `
    INSERT INTO my_keyspace.categories (permalink, name, creator, description, date_created, moderators, isDefault)
    VALUES (?, ?, ?, ?, toTimestamp(now()), ?, ?) IF NOT EXISTS;
  `;

  // Loop through the defaultCategories array
  for (const categoryName of defaultCategories) {
    const permalink = categoryName.toLowerCase();

    // Check if the category already exists
    const existsResult = await client.execute(queryCheckExists, [permalink], { prepare: true });
    if (existsResult.rowLength > 0) {
      console.log(`Category '${categoryName}' already exists.`);
      continue; // Skip this iteration, don't attempt to insert
    }

    // Using Lorem Ipsum text for default values where needed
    const creator = "azodu";
    const description = "The category for everything and anything! Post anything you'd like here.";
    const moderators = "azodu"; // Adjust based on how moderators are stored. If it's a list, you might need to serialize it accordingly.
    const isDefault = true;

    try {
      await client.execute(queryInsertCategory, [permalink, categoryName, creator, description, moderators, isDefault], { prepare: true });
      console.log(`Default category '${categoryName}' ensured.`);
    } catch (error) {
      console.error(`Error ensuring default category '${categoryName}':`, error);
    }
  }
}





async function flushAllTables(client, keyspace, tableNameOptional = null) {
  try {
    if (tableNameOptional) {
      // Flush only the specified table
      const queryTruncate = `TRUNCATE ${keyspace}.${tableNameOptional}`;
      await client.execute(queryTruncate);
      console.log(`Truncated table: ${tableNameOptional}`);
    } else {
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
    }

    console.log(`Tables in keyspace '${keyspace}' have been flushed.`);
  } catch (error) {
    console.error('Failed to flush tables', error);
  }
}


async function dropAllMaterializedViews(client, keyspace) {
  try {
    const queryGetViews = `SELECT view_name FROM system_schema.views WHERE keyspace_name = '${keyspace}'`;
    const resultViews = await client.execute(queryGetViews);

    for (let row of resultViews.rows) {
      const viewName = row['view_name'];
      const queryDropView = `DROP MATERIALIZED VIEW IF EXISTS ${keyspace}.${viewName}`;
      await client.execute(queryDropView);
      console.log(`Dropped materialized view: ${keyspace}.${viewName}`);
    }

    console.log(`All materialized views in keyspace '${keyspace}' have been dropped.`);
  } catch (error) {
    console.error('Failed to drop materialized views', error);
  }
}

async function dropAllTables(client, keyspace) {
  try {
    // First, drop all materialized views to avoid dependency issues
    await dropAllMaterializedViews(client, keyspace);

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


async function emptyCommentsTable(client) {
  try {
    const query = 'TRUNCATE my_keyspace.comments;';
    await client.execute(query);
    console.log('`comments` table has been emptied successfully.');
  } catch (error) {
    console.error('Failed to empty the `comments` table:', error);
  }
}


module.exports = { createKeyspace, createUsersTable, createCommentsTable, createPostsTable, flushAllTables, dropAllTables, createVotesTable, createCategoriesTable, createDefaultCategories, createLinksTable, emptyCommentsTable, createMaterializedViews, insertFakeUsers,createPostIdCounterTable,createUserSavedPostsTable };
