const he = require('he');




function validateComment(content) {
  const minLength = 6;
  const maxLength = 60000;

  // Trim whitespace from start and end of the comment content
  let trimmedContent = content.trim();

  // Remove specific characters and strings for the uniqueness check
  const charsAndSpacesToRemove = /<p>|<\/p>|<|>|p|\/|\s/gi;
  trimmedContent = trimmedContent.replace(charsAndSpacesToRemove, '');


  // Check for empty content or content that only has spaces or tab characters
  if (!trimmedContent) {
    return { isValid: false, message: "Comment cannot be empty." };
  }

  // Check for content length below minimum
  if (trimmedContent.length < minLength) {
    return { isValid: false, message: `Comment must be at least ${minLength} characters long.` };
  }

  // Check for content length exceeding maximum
  if (trimmedContent.length > maxLength) {
    return { isValid: false, message: `Comment must not exceed ${maxLength} characters.` };
  }

  const unsubstantiveTexts = [
    "hi", "hello", "hey", "thanks", "thank you", "thx", "good", "great", "nice", "ok", "okay",
    "lol", "haha", "hehe", "cool", "yes", "no", "yep", "nope", "wow", "omg", "ugh", "hmm",
    "meh", "yay", "nah", "pls", "please", "bye", "goodbye", "see ya", "idk", "imo", "imho",
    "fyi", "brb", "gtg", "k", "kk", "👍", "👎", "😂", "😍", "😭", "😊", "😒", "😉", "😜", "🙄"
  ];

  // Check for unsubstantive text content
  if (unsubstantiveTexts.includes(trimmedContent.toLowerCase())) {
    return { isValid: false, message: "Comment is too short or unsubstantive." };
  }

  const uniqueChars = new Set(trimmedContent).size;
  if (uniqueChars < 5) {
    return { isValid: false, message: "Comment is too short or unsubstantive." };
  }

  // If the content passes all checks
  return { isValid: true, message: "" };
}



function stripTagsExceptAllowed(html) {
  // Decode HTML entities first
  html = he.decode(html);

  // List of allowed tags
  const allowedTags = ['b', 'i', 'strong', 's', 'blockquote', 'ul', 'ol', 'a','p'];

  // Construct a regex pattern that matches anything not in the allowed list
  const regex = new RegExp(`<(?!/?(${allowedTags.join('|')})\\b)[^>]*>`, 'gi');

  // Replace tags that do not match the allowed list with an empty string
  return html.replace(regex, '');
}

function processHTMLFromUsers(content) {
  if (!content) {
    return content;
  }

  function cleanHtmlContent(content) {
    // Replace space encoded as "&nbsp;" with a normal space
    content = content.replace(/&nbsp;/gi, ' ');

    content = content.replace(/<p(?:\s+[^>]*)?>\s*(<br\s*\/?>|\s)*<\/p>/gi, '');

    content = stripTagsExceptAllowed(content); 

    return content;
}



  function removeDangerousTags(html) {
    // Remove script tags and their content
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // You can add more lines here to remove other potentially dangerous tags
    // Example: Remove iframe tags
    // html = html.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

    return html;
  }

  function removeAllAttributesExceptLinks(html) {
    // This regex looks for HTML tags that are not <a> and attempts to remove attributes inside them
    // It will leave <a href="..."> tags untouched
    const cleanHtml = html.replace(/<((?!a\b)\w+)(\s+[^>]+)?(>)/g, '<$1$3');
    return cleanHtml;
  }

  // Step 1: Clean the content (if needed, like removing &nbsp; or empty tags)
  content = cleanHtmlContent(content);


  // Step 2: Remove dangerous tags like <script>
  content = removeDangerousTags(content);

  // Step 3: Keep only <a> tags with href and optionally target="_blank", remove all other attributes
  content = content.replace(/<a\b[^>]*>/gi, function (match) {
    const hrefMatch = match.match(/\bhref="[^"]*"/i);
    const targetMatch = match.match(/\btarget="_blank"/i);
    return `<a ${hrefMatch ? hrefMatch[0] : ''} ${targetMatch ? targetMatch[0] : ''}>`;
  });

  // Step 4: Remove attributes from all other tags
  content = removeAllAttributesExceptLinks(content);

  return content;
}


function validateUsername(username) {
  const minLength = 3;
  const maxLength = 20;
  const regex = /^[a-zA-Z0-9]+$/; // Alphanumeric characters only

  let message = "";
  let isValid = true;

  // Check for empty username
  if (!username) {
    message = "Username cannot be empty.";
    isValid = false;
  }
  // Check for length constraints
  else if (username.length < minLength || username.length > maxLength) {
    message = `Username must be between ${minLength} and ${maxLength} characters long.`;
    isValid = false;
  }
  // Check for spaces or tabs
  else if (/\s/.test(username)) { // \s matches spaces, tabs, and other whitespace characters
    message = "Username cannot contain spaces or tabs.";
    isValid = false;
  }
  // Check for alphanumeric characters only
  else if (!regex.test(username)) {
    message = "Username must contain only alphanumeric characters.";
    isValid = false;
  }

  return { isValid, message };
}



module.exports = { validateComment, processHTMLFromUsers, validateUsername };
