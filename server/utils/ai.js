const OpenAI = require('openai');

const secrets = require('../secrets.json');

openaiApiKey = secrets.OPENAI_API_KEY;


const openai = new OpenAI({
  apiKey: openaiApiKey,
});


function removeFirstSentence(text) {
  // Regular expression to match the end of the first sentence
  // This looks for a period, exclamation mark, or question mark followed by a space or the end of the text
  const firstSentenceEndRegex = /[.!?](\s|$)/;

  // Find the index of the end of the first sentence
  const match = firstSentenceEndRegex.exec(text);
  if (match) {
    // If a match is found, remove the first sentence by returning the substring starting from the character after the match
    // Adding 1 to move past the space after the sentence-ending punctuation (if it's not the end of the text)
    return text.substring(match.index + match[0].length);
  } else {
    // If no match is found (no sentence-ending punctuation), return the original text
    return text;
  }
}


async function generateAIComment(title, summary) {
  try {

    // Define minimum and maximum token limits
    const minTokens = 60; // For example, minimum of 40 tokens
    const maxTokens = 300; // For example, maximum of 100 tokens

    // Randomly select a max_tokens value within the specified range
    const selectedMaxTokens = Math.floor(Math.random() * (maxTokens - minTokens + 1)) + minTokens;



    // List of popular subreddits to simulate response styles
    const subreddits = [
      'r/politics',
      'r/news',
      'r/mildlyinteresting',
      'r/science',
      'r/worldnews',
      'r/technology',
      'r/interestingasfuck',
      'r/todayilearned',
      'r/AskReddit',
    ];

    // Randomly select a subreddit
    const selectedSubreddit = subreddits[Math.floor(Math.random() * subreddits.length)];

    // Construct the prompt using the selected subreddit
    let promptVariation = `you are a random redditor and you come across a post titled "${title}" and summarized as "${summary}". Respond as if you frequent ${selectedSubreddit}. usually capitalize but not always, and sometimes bad grammar and misspellings. DO NOT ASK rhetorical questions like "huh?" or regurgitate information. do not say "wow." do not mention reddit or ${selectedSubreddit} in your response.`;

    promptVariations = [promptVariation];


    // Randomly select a prompt variation
    const selectedPrompt = promptVariations[Math.floor(Math.random() * promptVariations.length)];

    const completion = await openai.chat.completions.create({
      model: "gpt-4", // Ensure to use the latest model version if possible for improved performance
      messages: [
        { role: "user", content: selectedPrompt }
      ],
      max_tokens: selectedMaxTokens,
    });

    let generatedContent = completion.choices[0].message.content.trim();

    // Process the generated content as before
    if (generatedContent.startsWith('"') && generatedContent.endsWith('"')) {
      generatedContent = generatedContent.substring(1, generatedContent.length - 1);
    }

    generatedContent = removeFirstSentence(generatedContent);


    generatedContent = generatedContent
      .split('\n\n')
      .map(paragraph => `<p>${paragraph.trim()}</p>`)
      .join('');


    return generatedContent;
  } catch (error) {
    console.error('Error generating comment from OpenAI:', error);
    return null;
  }
}

async function generateMultipleAIComments(title, summary, numberOfComments = 5, model) {
  try {
    // Ensure the number of comments requested is within a practical limit for a single prompt

    const promptVariation = `Given the article titled "${title}" and summarized as "${summary}", write ${numberOfComments} short comments from different perspectives. Avoid rhetorical questions, direct quotations from the summary, and exclamations like "wow". make sure each is completely different from each other, use improper grammer for some of the comments. return an array of strings i.e. json and put p HTML tags around paragraphs. DO NOT MENTION WHO YOU ARE OR WHAT PERSPECTIVE YOU COME FROM.`;

    const selectedMaxTokens = numberOfComments * 60; // Estimate 60 tokens per comment

    const completion = await openai.chat.completions.create({
      model: model,
      messages: [{
        role: "user",
        content: promptVariation
      }],
      max_tokens: selectedMaxTokens,
    });

    let generatedContent = completion.choices[0].message.content.trim();

    comments = JSON.parse(generatedContent);

    // Process the generated content to split into individual comments
    // This example assumes the model will use clear separations (e.g., numbered list)
    // Adjust the splitting logic based on observed output structure
    //  const comments = generatedContent.split('\n').filter(line => line.trim() !== '').map(line => line.trim());

    return comments;
  } catch (error) {
    console.error('Error generating comments from OpenAI:', error);
    return [];
  }
}



async function generateSummary(text) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: `Summarize, max 3 sentences in one paragraph: "${text}"` }
      ],
    });


    let generatedContent = completion.choices[0].message.content.trim();
    generatedContent = '<p>' + generatedContent + '</p>';

    // Check if the first and last characters are quotation marks and remove them
    if (generatedContent.startsWith('"') && generatedContent.endsWith('"')) {
      generatedContent = generatedContent.substring(1, generatedContent.length - 1);
    }


    return generatedContent;
  } catch (error) {
    console.error('Error generating comment from OpenAI:', error);
    return null;
  }
}


module.exports = {
  generateAIComment,
  generateSummary, // Exporting the new function
  generateMultipleAIComments
};
