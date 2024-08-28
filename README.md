# Azodu - the open source Old Reddit clone that doesn't suck
With Azodu you can quickly have a feature-complete Reddit-like site that is easy to setup, highly scalable and requires no human moderation. 

The two biggest points of friction for Reddit-like sites getting off the ground are 1) scalability and 2) moderation. Azodu solves both those problems straight out of the box. It solves scalability by relying on decentralized database technology with Cassandra (instead of expensive SQL solutions) and generating purely static HTML docs which can be efficiently HTTP-cached (at application and CDN level). And it solves moderation by relying on AI, instead of teams of moderators, to evaluate content. 

In addition, there are no arcane frameworks used on the front or backend. Everything is vanilla HTML/CSS and Javascript and written from scratch for minimal software bloat.  

### Live Demo
Go to [Azodu.com](https://azodu.com) to see the software in action. Learn more about the Azodu.com project in the [How it works](https://azodu.com/c/azodu/123e4567-e89b-12d3-a456-426614174001/how-it-works) and [Why I made Azodu](https://azodu.com/c/anything/3e97c068-5a54-11ef-a739-60b07b0766be/why-i-made-azodu) section. 


### Why is Azodu more scalable than other Reddit clones?
Instead of relying on traditional SQL tech like MySql or Postgres, Azodu uses [Apache Cassandra](https://cassandra.apache.org/_/index.html). 
Cassandra excels in handling large volumes of data across multiple data centers with minimal downtime, thanks to its decentralized, masterless architecture. This allows for continuous availability and the ability to handle enormous write and read loads by distributing data across multiple nodes. Cassandra also has the ability to scale horizontally by simply adding more nodes to the cluster without downtime making it ideal for Reddit-like sites, which may experience unpredictable spikes in user traffic. 

**Traditional SQL scaling**: Your DB server reaches 100% capacity so your only choice is to upgrade to better hardware or create read replicas. Both these avenues are extremely expensive. And it is the reason why Reddit-like sites can't scale without a massive investment. 

**Cassandra scaling**: Simply add more cassandra nodes to the cluster. You can scale to millions of DAU going completely out of pocket if you make proper use of efficient HTTP caching! 

### What makes Azodu different than Reddit?
* All content is moderated by AI instead of human moderators. The creator of a community only has the ability to pin posts. They cannot ban users or delete content. The AI will check for relevancy (based on what the community creator writes in the relevancy prompt) when a post is submitted to the category and will also check for malicious content. Don't like AI moderation? Simply rip it out and replace it with human moderation. 

* The UI is clean and focused, and emphasized discussion around content itself as opposed to content itself. It is closer to Old Reddit than new Reddit. New Reddit is more like Twitter and Facebook... interfaces which encourage doomscrolling and dark patterns instead of healthy online discourse. Discourse (aka the comments) is very much the emphasis.

* Users earn Azo, the platform currency for getting upvotes. They can use this currency to open new communities (which function like sub-reddits). This is to prevent a single person or group of people from reserving all the best names

* All links submitted are summarized by AI, so that users can get the gist of what a link is before clicking it.

### Features
* Comments: Create, reply, edit, delete, save
* Posts: Create (text and link posts), reply, edit, delete, save
* Rich Text editing: powered by [Quill](https://quilljs.com/) 
* Currency: Users earn a currency for getting their content upvoted which they can use to create categories
* Categories: Create, subscribe, unsubscribe
* Votes: Vote on comments and posts
* Authentication: Uses JSON web tokens
* Responsive design: works out of the box on PC, mobile and tablet
* Administration: pin posts, delete posts 
* AI Moderation: posts and comments are all run though Open AI's moderation endpoint
* AI Summaries: All post content is summarized with AI
* Thumbnails: Auto-generated from links on submission
* Scalibility: Built in HTTP caching behind Cassandra with a highly scalable architecture

### AI-generated comments. 

By running a node as a master (`node server/server.js --master`) you can automatically have AI generate posts (from Reddit URLs which can be altered in `fetchFromExternalAndCreatePosts`) and comments. This is meant for demonstration and testing purposes only. 

## Configuration

To configure your application, you need to create a `secrets.json` file in your project root. This file will store all the necessary secret keys required for various services. Below is the template for the `secrets.json` file:

```json
{
  "JWT_SECRET": "XXXXXXXXXXXXXXXXX", // The secret used for JSON web tokens, which is used for authentication
  "OPENAI_API_KEY": "XXXXXXXXXXXXXXXXX", // If you wish to use AI moderation with OpenAI, you will need an API key
  "CASSANDRA_PW": "XXXXXXXXXXXXXXXXX", // Used for authenticating your Node.js servers with Cassandra nodes
  "RECAPTCHA_KEY": "XXXXXXXXXXXXXXXXX" // Google reCAPTCHA API key, which is used as spam protection on the user registration page
}
```

## Installation

Follow these steps to get the project up and running locally.

1. Clone the repository
2. Run `npm install` in the /server directory
3. [Install and run Cassandra](https://cassandra.apache.org/doc/stable/cassandra/getting_started/installing.html) on your local machine. Make sure that you have materialized views enabled in cassandra.yaml as Azodu makes extensive use of materialized views. 
4. In server/server.js, set `contactPoints: ['127.0.0.1']`. In production, this IP address should be swapped out with one or multiple other Cassandra nodes that are live and connected to your production cluster(s).
6. Run `node server/server.js`. Make sure you have created a secrets.json (see above Configuration section) file before running this. 
7. View the site at `localhost` which you can navigate to via your browser address bar

## Infastructure
I recommend a very simple architecture. For every node server you spin up, create an A record (with the server IP) for it at your root domain. This will force users into a round robin distribution to your servers. As your site grows, you should spin up more node and Cassandra servers based on load.

Althought Azodu does have application HTTP cache in node, I also recommend putting Cloudflare in front (using the "cache everything" feature) and caching HTML docs (which translate to DB calls). This is possible to do because all pages are designed to be static and not user-specific. The JWT architechture for users and authentication makes this possible.  

## Deployment
A very simple deployment script is written in `scripts/deploy.js`. You can simply swap out the IP addresses in the `servers` var with your own servers. You also need to change the `privateKey` var to reference the file location of the SSH key for your server(s). 



## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT). You are free to use, modify, distribute, and sell it under the terms of the MIT License.

As a condition of using this project, you are required to include a link back to [Azodu.com](https://azodu.com) in the footer of any application or website using this software, with the text "Powered by Azodu." The link may be removed upon special request and approval from the Azodu team. Please contact us if you wish to discuss the removal of the link.

For more information on the licensing terms, see the LICENSE file in this repository.

