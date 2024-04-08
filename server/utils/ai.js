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

function getRandomNumberBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function removeQuotesFromString(inputString) {
  // Replace all occurrences of double quotes in the string
  const withoutDoubleQuotes = inputString.replace(/"/g, '');
  // Replace all occurrences of single quotes in the string
  const result = withoutDoubleQuotes.replace(/'/g, '');
  return result;
}


// Simulated cache for storing and retrieving generated comments by title
const commentsCache = {};

async function generateAIComment(title, summary, model, post_id) {
  const maxNum = getRandomNumberBetween(3, 7); 

  if (commentsCache[post_id] && commentsCache[post_id].length === 0) {
    // All comments for this title have been used. Post id: + post_id + ' title: ' + title
    return null; // No more comments to serve for this title
  }

  if (commentsCache[post_id] && commentsCache[post_id].length > 0) {
    // Responding with cached comment
    const comment = commentsCache[post_id].shift();

    // Check if we've just served the last comment
    if (commentsCache[post_id].length === 0) {
      // No more cached comments for this title.
    }

    return comment;
  }

  try {
    const prompt = 'Respond with ' + maxNum + ' different perspective comments in an HTML list format. Keep the comments shorts. Do not say things like "this is interesting." Try to mimic a reddit user as best as possible. The content is as follows ... Title: ' + title + ' Summary: ' + summary;
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300 * maxNum,
      temperature: 1,
    });

    let generatedContent = completion.choices[0].message.content.trim();
    let listItems = htmlListToArray(generatedContent);
    if (listItems.length < 1) {
      commentsCache[post_id] = []; // Mark this title as having no more comments available
      return null;
    }

    // Filter out comments containing the word "interesting"
    listItems = listItems.filter(comment => !comment.toLowerCase().includes('interesting'));

    // Wrap each comment in <p> tags and process them
    const wrappedListItems = listItems.map(comment => `<p>${makeTextMoreHuman(removeQuotesFromString(comment))}</p>`);
    commentsCache[post_id] = wrappedListItems.slice(1); // Cache the remaining comments
    
    return wrappedListItems.length > 0 ? wrappedListItems[0] : null;
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

    return summary;
  } catch (error) {
    console.error('Error generating summary and/or title from OpenAI:', error);
    return [null, null];
  }
}

async function moderateContent(content) {
  try {
    // Directly call the Moderation API with the input text
    const moderation = await openai.moderations.create({
      input: content
    });

    // Log the full moderation response
    console.log("OpenAI Moderation API Response:", JSON.stringify(moderation, null, 2));

    // For simplicity, assume content is safe if no categories of concern are detected
    // Adjust according to your specific moderation policies and the structure of the moderation response
    const isContentSafe = !moderation.results[0].flagged;

    return isContentSafe;
  } catch (error) {
    // Enhanced error logging
    console.error("Error calling Moderation API:", error);
    throw new Error("Moderation check failed");
  }
}



function makeTextMoreHuman(text, noCapitalizeChance = 20, removePeriodChance = 20) {
  // Split the text into sentences
  const sentences = text.split('. ');
  
  // Process each sentence for capitalization
  let processedSentences = sentences.map(sentence => {
    // Randomly decide not to capitalize the first letter of a sentence
    if (Math.random() * 100 < noCapitalizeChance) {
      // Ensure there's a sentence to process
      if (sentence.length > 0) {
        return sentence.charAt(0).toLowerCase() + sentence.slice(1);
      }
    }
    return sentence;
  });

  // Join the processed sentences back into text
  let processedText = processedSentences.join('. ');

  // Regardless of the number of sentences, randomly decide to remove the last period
  if (processedText.endsWith('.') && Math.random() * 100 < removePeriodChance) {
    processedText = processedText.slice(0, -1);
  }

  return processedText;
}

module.exports = {
  generateAIComment,
  generateSummary,
  moderateContent 
};
