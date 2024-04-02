const axios = require('axios');
const cheerio = require('cheerio');


function generateCategoryPermalink(title) {
  const basePath = "";
  const cleanedTitle = title
    .replace(/[^\w\s]/gi, '') // Remove non-alphanumeric characters except spaces
    .trim() // Remove leading and trailing spaces
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .toLowerCase(); // Convert to lowercase

  const truncatedTitle = cleanedTitle.substring(0, 147); // Truncate to 147 characters to leave room for "/c/"
  return basePath + truncatedTitle;
}



async function fetchURLAndParseForThumb(url) {
  const debug = false; 

  if (debug) console.log(`Fetching content from URL: ${url}`);

  try {
    const { data } = await axios.get(url);
    if (debug) console.log(`Content fetched successfully from ${url}`);
    const $ = cheerio.load(data);

    let imageUrl = $('meta[property="og:image"]').attr('content');
    if (imageUrl) {
      if (debug) console.log(`Open Graph image found: ${imageUrl}`);
    } else {
      if (debug) console.log(`No Open Graph image found, looking for the first <img> tag...`);
      imageUrl = $('img').first().attr('src');

      if (imageUrl) {
        if (debug) console.log(`First <img> tag found: ${imageUrl}`);
      } else {
        if (debug) console.log(`No <img> tags found, looking for favicon...`);
        imageUrl = $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href');

        if (imageUrl) {
          if (debug) console.log(`Favicon found: ${imageUrl}`);
        } else {
          if (debug) console.log(`No favicon found, using domain root favicon.ico as a last resort...`);
          // Attempt to use /favicon.ico at the domain root
          const baseUrl = new URL(url);
          imageUrl = `${baseUrl.origin}/favicon.ico`;
          if (debug) console.log(`Attempting to use root favicon.ico: ${imageUrl}`);
        }
      }
    }

    // Resolve relative image URLs to absolute
    if (imageUrl && !imageUrl.startsWith('http')) {
      if (debug) console.log(`Image URL is relative, converting to absolute...`);
      const baseUrl = new URL(url);
      imageUrl = new URL(imageUrl, baseUrl.origin).href;
      if (debug) console.log(`Converted to absolute URL: ${imageUrl}`);
    }

    return imageUrl || null; // Return null if no image is found
  } catch (error) {
    if (debug) console.error(`Error fetching thumbnail from ${url}:`, error.message);
    return null;
  }
}


function extractRelevantText(htmlContent) {
  const $ = cheerio.load(htmlContent);
  let textContent = "";

  $('p').each((i, elem) => {
    textContent += $(elem).text() + "\n\n"; // Adding two newlines to separate paragraphs
  });

  return textContent.trim(); // Trim the final string to remove any leading/trailing whitespace
}


module.exports = {
  generateCategoryPermalink,fetchURLAndParseForThumb,extractRelevantText
};
