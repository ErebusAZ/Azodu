
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
