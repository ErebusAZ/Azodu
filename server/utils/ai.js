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


function htmlListToArray(htmlString) {
  htmlString = htmlString.trim();

  // Check if the string contains <ul>, <ol>, and at least one <li> tag
  if ((!htmlString.includes('<ul>') && !htmlString.includes('<ol>')) || !htmlString.includes('<li>')) {
    console.log('No valid list found in the response.');
    return []; // Return an empty array to indicate no valid items found
  }

  // The rest of your original function follows
  const listItemRegex = /<li>(.*?)<\/li>/gs;
  const matches = htmlString.matchAll(listItemRegex);
  const listItems = Array.from(matches).map(match => match[1]);

  return listItems;
}



// Simulated cache for storing and retrieving generated comments by title
const commentsCache = {};
// Assuming htmlListToArray and commentsCache are defined as shown previously

async function generateAIComment(title, summary, model) {
  // Check if there are cached comments for this title
  if (commentsCache[title] && commentsCache[title].length > 0) {
    console.log('Responding with cached comment');
    return commentsCache[title].shift();
  }

  try {
    const prompt = 'Respond with 5 varied in opinion, distinct comments in an HTML list to the following: ' + title + ' summary: ' + summary;
    
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
    });

    let generatedContent = completion.choices[0].message.content.trim();


    // Convert the HTML list to an array using the htmlListToArray function
    const listItems = htmlListToArray(generatedContent);
    if (listItems.length < 1)
      return null; 

    
    // Wrap each comment in <p> tags
    const wrappedListItems = listItems.map(comment => `<p>${comment}</p>`);

    
    commentsCache[title] = wrappedListItems.slice(1);
    
    // Return the first element or null if the list is empty
    return listItems.length > 0 ? listItems[0] : null;
  } catch (error) {
    console.error('Error generating comment from OpenAI:', error);
    return null;
  }
}





async function generateSummary(text) {
  try {
    let promptMessage = `Summarize the following three short sentences or less: "${text}"`;
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: promptMessage }
      ],
    });

    let generatedContent = completion.choices[0].message.content.trim();


    let summary = '<p>' + generatedContent + '</p>';
    console.log(summary); 

    return summary;
  } catch (error) {
    console.error('Error generating summary and/or title from OpenAI:', error);
    return [null, null];
  }
}





module.exports = {
  generateAIComment,
  generateSummary, // Exporting the new function
};
