const OpenAI = require('openai'); 

const secrets = require('../secrets.json');

openaiApiKey = secrets.OPENAI_API_KEY;


const openai = new OpenAI({
  apiKey: openaiApiKey,
});


async function generateCommentForTitle(title) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: `Create a comment for this title as if you are a Redditor: "${title}"` }
      ],
    });

    console.log(JSON.stringify(completion, null, 2)); // Log the entire response

    let generatedContent = completion.choices[0].message.content.trim();

    // Check if the first and last characters are quotation marks and remove them
    if (generatedContent.startsWith('"') && generatedContent.endsWith('"')) {
      generatedContent = generatedContent.substring(1, generatedContent.length - 1);
    }

    // Wrap paragraphs with <p> tags
    generatedContent = generatedContent
      .split('\n\n') // Assuming paragraphs are separated by two newlines
      .map(paragraph => `<p>${paragraph.trim()}</p>`) // Wrap each paragraph with <p> tags
      .join(''); // Rejoin the paragraphs into a single string

    return generatedContent;
  } catch (error) {
    console.error('Error generating comment from OpenAI:', error);
    return null;
  }
}

module.exports = {
  generateCommentForTitle,
};