import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";
import { fetchWithRetry } from "./utils.mjs";

/**
 * Fetches all authors from WordPress and saves them to JSON
 * - Creates authors directory if it doesn't exist
 * - Loads existing authors from JSON if present
 * - Fetches new authors using pagination
 * - Skips authors that already exist
 * - Saves updated author list back to JSON
 *
 * @returns {Promise<Array>} Array of author objects
 */
export async function fetchAuthors() {
	console.log("Exporting authors...");

	// Set up directory structure and file paths
	const dataDirectory = path.resolve(process.cwd(), config.dataDirectory);
	const authorsDirectory = path.resolve(dataDirectory, "authors");
	const authorsFile = path.resolve(authorsDirectory, "authors.json");

	// Create authors directory if it doesn't exist
	if (!fs.existsSync(authorsDirectory)) {
		await fs.promises.mkdir(authorsDirectory, { recursive: true });
	}

	// Load existing authors from JSON if present
	let newAuthors = [];
	if (fs.existsSync(authorsFile)) {
		const existingAuthors = await fs.promises.readFile(authorsFile, "utf8");
		newAuthors = JSON.parse(existingAuthors);
	}

	// Get total number of author pages from WordPress
	const initialResponse = await fetchWithRetry(`${config.apiUrl}users`);
	const totalPages = parseInt(initialResponse.headers.get("x-wp-totalpages"), 10);
	console.log(`Found ${totalPages} pages of authors`);

	// Fetch each page of authors
	for (let page = 1; page <= totalPages; page++) {
		console.log(`Fetching authors page ${page}/${totalPages}`);
		const response = await fetchWithRetry(`${config.apiUrl}users?page=${page}&per_page=100`);
		const authors = await response.json();

		// Process each author from the current page
		for (const author of authors) {
			// Check if author already exists using WordPress ID
			const existingAuthorIndex = newAuthors.findIndex(
				(existingAuthor) => Number(existingAuthor.wordpressId) === Number(author.id)
			);

			// Skip if author already exists
			if (existingAuthorIndex > -1) {
				console.log(`Author "${author.name}" already exists, skipping...`);
				continue;
			}

			// Add new author to the list
			console.log(`Adding author: ${author.name} (ID: ${author.id})`);
			newAuthors.push({
				id: author.slug, // URL-friendly version of name
				name: author.name, // Display name
				wordpressId: Number(author.id) // Original WordPress user ID
			});
		}
	}

	// Save updated author list to JSON file
	await fs.promises.writeFile(authorsFile, JSON.stringify(newAuthors, null, 2));
	console.log(`Saved ${newAuthors.length} authors to ${authorsFile}`);
	return newAuthors;
}
