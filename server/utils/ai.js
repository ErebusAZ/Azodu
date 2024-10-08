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


function removeLeadingNumberFromComment(comment) {
  // This regular expression matches any leading number followed by a period and a space
  const leadingNumberPattern = /^\d+\.\s+/;
  return comment.replace(leadingNumberPattern, '');
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
  // Check if the first character is a quote (double or single) and remove it
  if (inputString.startsWith('"') || inputString.startsWith("'")) {
    inputString = inputString.substring(1);
  }

  // Check if the last character is a quote (double or single) and remove it
  if (inputString.endsWith('"') || inputString.endsWith("'")) {
    inputString = inputString.substring(0, inputString.length - 1);
  }

  return inputString;
}



// Simulated cache for storing and retrieving generated comments by title
const commentsCache = {};

function removeUnwantedPatterns(inputString) {
  // First, replace occurrences of "..." or ".." with an empty string.
  // Second, remove all Unicode emojis.
  // Finally, replace exclamation points with periods.
  return inputString
    .replace(/\.\.+/g, '') // Removes sequences of two or more periods.
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, '') // Removes emojis.
    .replace(/!/g, '.'); // Replaces all exclamation points with periods.
}

async function generateAIComment(title, summary, model, post_id) {
  const maxNum = getRandomNumberBetween(2, 5);

  if (commentsCache[post_id] && commentsCache[post_id].length === 0) {
    return null; // No more comments to serve for this title
  }

  if (commentsCache[post_id] && commentsCache[post_id].length > 0) {
    const comment = commentsCache[post_id].shift();
    if (commentsCache[post_id].length === 0) {
      // No more cached comments for this title.
    }
    return comment;
  }

  try {
    const prompt = 'Respond with ' + maxNum + ' different perspective comments in an HTML list format. Try to mimic a random internet user as best as possible, some should be dripping with sarcasm. The content is as follows ... Title: ' + title + ' Summary: ' + summary;
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

    // Filter out specific phrases and remove unwanted patterns
    listItems = listItems.filter(comment => !comment.toLowerCase().includes('interesting'))
      .filter(comment => !comment.toLowerCase().includes('unfortunate'))
      .filter(comment => !comment.toLowerCase().includes('excited'))
      .filter(comment => !comment.toLowerCase().includes('we need to'))
      .filter(comment => !comment.toLowerCase().includes('important'))
      .filter(comment => !comment.toLowerCase().includes('exciting'))
      .filter(comment => !comment.toLowerCase().includes('wow'))
      .filter(comment => !comment.toLowerCase().includes('wonder'))
      .filter(comment => !comment.toLowerCase().includes('hope'))
      .filter(comment => !comment.toLowerCase().includes('disappointing'))
      .filter(comment => !comment.toLowerCase().includes('disappointed'))
      .filter(comment => !comment.toLowerCase().includes('worth considering'))
      .filter(comment => !comment.toLowerCase().includes('good point'))
      .filter(comment => !comment.toLowerCase().includes('complex issue'))
      .filter(comment => !comment.toLowerCase().includes('sobering'))
      .filter(comment => !comment.toLowerCase().includes('heart goes out'))
      .filter(comment => !comment.toLowerCase().includes('heartbreaking'))
      .filter(comment => !comment.toLowerCase().includes('thought-provoking'))
      .filter(comment => !comment.toLowerCase().includes('thought provoking'))
      .filter(comment => !comment.toLowerCase().includes('finally'))
      .filter(comment => !comment.toLowerCase().includes('impressive'))
      .filter(comment => !comment.toLowerCase().includes('can\'t wait'))
      .filter(comment => !comment.toLowerCase().includes('it\'s great'))
      .filter(comment => !comment.toLowerCase().includes('comment'))
      .filter(comment => !comment.toLowerCase().includes('concerning'))
      .filter(comment => !comment.toLowerCase().includes('good to see'))
      .filter(comment => !comment.toLowerCase().includes('nice to see'))
      .filter(comment => !comment.toLowerCase().includes('omg'))
      .filter(comment => !comment.toLowerCase().includes('#'))
      .filter(comment => !comment.toLowerCase().includes('lol'))

      .map(comment => removeLeadingNumberFromComment(comment)) // New line to remove leading number, period, space



      .map(comment => removeUnwantedPatterns(comment)); // New line to remove "..." and ".."

    // Process comments
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
    return '';
  }
}



async function checkCategoryRelevancy(title, content, category, categoryDescription, summary, postType) {
  try {
    let prompt = `Based on the title, content (which is sometimes a URL), and category description provided, rate the relevancy of this post to the category "${category}" on a scale from 1 to 1000. Only provide the number, nothing else.\n\n`;
    prompt += `Title: ${title}\n`;
    prompt += `Content: ${content}\n`;
    if (summary) {
      prompt += `Summary: ${summary}\n`;
    }
    prompt += `Category Description: ${categoryDescription}\n`;
    prompt += `Post Type: ${postType}\n`;

    console.log("Sending the following prompt to OpenAI:", prompt); // Log the prompt

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: prompt }
      ],
      max_tokens: 20,  // Increase max tokens slightly to accommodate potentially larger number responses
      temperature: 0.7  // Adjusting temperature to allow for a bit of variability while still aiming for relevance
    });

    console.log("OpenAI API response:", JSON.stringify(completion, null, 2)); // Log the raw API response

    // Extract and parse the relevancy score from the API response
    let contentResponse = completion.choices[0].message.content.trim();
    console.log("Extracted content:", contentResponse); // Log the extracted content for verification

    // Attempt to directly parse the number from the response
    let relevancyScore = parseFloat(contentResponse);

    console.log('Parsed relevancy score:', relevancyScore); // Log the parsed relevancy score
    return isNaN(relevancyScore) ? 0 : relevancyScore;  // Return 0 if parsing fails or no number is found
  } catch (error) {
    console.error('Error checking category relevancy:', error);
    return 0;  // Return 0 if there's an error in checking relevancy
  }
}


async function moderateContent(content, title, author) {
  try {
    // Directly call the Moderation API with the input text
    const moderation = await openai.moderations.create({
      input: author + ': ' + (title ? (title + '. ' + content) : content)
    });

    // Log the full moderation response
    console.log("OpenAI Moderation API Response:", JSON.stringify(moderation, null, 2));

    // Initialize a variable to track content safety
    let isContentSafe = true;

    // Loop through each category and check the scores
    const categoryScores = moderation.results[0].category_scores;
    const flaggedCategories = moderation.results[0].categories;

    for (let category in categoryScores) {
      if (flaggedCategories[category]) {
        if (category === 'harassment' && categoryScores[category] > 0.97) {
          isContentSafe = false;
          break;
        } else if (category !== 'harassment') {
          // You can define more rules for other categories here if needed
          isContentSafe = false;
          break;
        }
      }
    }

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
  moderateContent,
  checkCategoryRelevancy
};
