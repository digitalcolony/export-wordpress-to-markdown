import fs from "node:fs";
import path from "node:path";
import TurndownService from "turndown";
import * as cheerio from "cheerio";

import { downloadImage, convertEscapedAscii } from "./utils.mjs";
import { setupCleanup } from "./cleanup.mjs";
import { fetchAuthors } from "./authors.mjs";
import { config } from "./config.mjs";

// Initialize cleanup handlers for graceful shutdown
setupCleanup();

console.log("Exporting data from Wordpress...");

// Configure paths for data storage
const dataDirectory = path.resolve(process.cwd(), "data");
const categoriesFile = path.resolve(dataDirectory, "categories.json");
const authorsDirectory = path.resolve(dataDirectory, "authors");
const authorsFile = path.resolve(authorsDirectory, "authors.json");

// WordPress REST API endpoints
const categoriesUrl = `${config.apiUrl}categories`;
const postsUrl = `${config.apiUrl}posts`;
const tagsUrl = `${config.apiUrl}tags`;
const mediaUrl = `${config.apiUrl}media`;

// Track failed image downloads
const imagesNotDownloaded = [];

// Create data directory if it doesn't exist
if (!fs.existsSync(dataDirectory)) {
	fs.mkdirSync(dataDirectory);
}

/**
 * Fetches all categories from WordPress and saves them to JSON
 * Skips categories with no posts
 */
async function fetchCategories() {
	console.log("Exporting categories...");

	let newCategories = [];

	if (fs.existsSync(categoriesFile)) {
		const existingCategories = await fs.promises.readFile(categoriesFile, "utf8");
		newCategories = JSON.parse(existingCategories);
	}

	const totalPagesResponse = await fetch(categoriesUrl);
	const totalPages = totalPagesResponse.headers.get("x-wp-totalpages");

	const importData = async (page) => {
		const response = await fetch(`${categoriesUrl}?page=${page}`);
		const categories = await response.json();

		for (const category of categories) {
			if (category.count === 0) {
				continue;
			}

			console.log("Exporting category:", category.name);

			const existingCategoryIndex = newCategories.findIndex(
				(existingCategory) => existingCategory.id === category.slug
			);

			if (existingCategoryIndex > -1) {
				console.log(`Category "${category.slug}" already exists, skipping...`);
				newCategories[existingCategoryIndex].wordpressId = category.id;
				continue;
			}

			newCategories.push({
				id: category.slug,
				name: category.name,
				description: category.description,
				wordpressId: category.id
			});
		}
	};

	for (let page = 1; page <= totalPages; page++) {
		await importData(page);
	}

	await fs.promises.writeFile(categoriesFile, JSON.stringify(newCategories, null, 2));
}

/**
 * Downloads and processes posts from WordPress
 * - Fetches all posts using pagination
 * - Downloads associated images
 * - Converts HTML to Markdown
 * - Creates frontmatter
 * - Saves posts as Markdown files
 */
async function fetchPosts() {
	console.log("Exporting posts...");
	let totalExportedPosts = 0;

	try {
		// Validate authors file exists
		if (!fs.existsSync(authorsFile)) {
			throw new Error("Authors file not found. Please run fetchAuthors first.");
		}

		const authorsFileContent = await fs.promises.readFile(authorsFile, "utf8");
		const authors = JSON.parse(authorsFileContent);

		// Validate categories file exists
		if (!fs.existsSync(categoriesFile)) {
			throw new Error("Categories file not found. Please run fetchCategories first.");
		}

		const categoriesFileContent = await fs.promises.readFile(categoriesFile, "utf8");
		const categories = JSON.parse(categoriesFileContent);

		/**
		 * Downloads a single image for a post
		 * @param {string} src - Image URL
		 * @param {string} pathToPostFolder - Destination folder
		 * @returns {string|undefined} Filename if successful, undefined if failed
		 */
		const downloadPostImage = async (src, pathToPostFolder) => {
			if (!src || !pathToPostFolder) {
				return;
			}

			const fileName = path.basename(src).split("?")[0];
			const destinationFile = path.resolve(pathToPostFolder, fileName);

			if (fs.existsSync(destinationFile)) {
				//console.log(`Post image "${destinationFile}" already exists, skipping...`);
				return fileName;
			}

			const imageDownloaded = await downloadImage(src, destinationFile);

			if (!imageDownloaded) {
				imagesNotDownloaded.push(src);
			}

			return imageDownloaded ? fileName : undefined;
		};

		/**
		 * Cleans up HTML content
		 * - Removes unnecessary attributes
		 * - Handles special elements like polls
		 * @param {string} html - Raw HTML content
		 * @returns {string} Cleaned HTML
		 */
		const cleanUpHtml = (html) => {
			const $ = cheerio.load(html);

			const figures = $("figure");
			for (const figure of figures) {
				$(figure).removeAttr("class");
			}

			const images = $("img");
			for (const image of images) {
				$(image).removeAttr("class width height data-recalc-dims sizes srcset");
			}

			const captions = $("figcaption");
			for (const caption of captions) {
				$(caption).removeAttr("class");
			}

			$(".wp-polls").html(
				"<em>Polls have been temporarily removed while we migrate to a new platform.</em>"
			);
			$(".wp-polls-loading").remove();

			return $.html();
		};

		/**
		 * Downloads images in post content and updates src attributes
		 * @param {string} html - Post HTML content
		 * @param {string} pathToPostFolder - Folder to save images
		 * @returns {string} HTML with updated image paths
		 */
		const downloadAndUpdateImages = async (html, pathToPostFolder) => {
			const $ = cheerio.load(html);
			const images = $("img");

			for (const image of images) {
				const src = $(image).attr("src");
				const newSrc = await downloadPostImage(src, pathToPostFolder);
				$(image).attr("src", newSrc);
			}

			return $.html();
		};

		/**
		 * Processes a batch of posts
		 * @param {number} page - Page number to fetch
		 */
		const importData = async (page) => {
			const perPage = 100;
			const response = await fetch(`${postsUrl}?page=${page}&per_page=${perPage}`);
			const posts = await response.json();

			// Use postsLimit from config
			const limitedPosts = config.postsLimit ? posts.slice(0, config.postsLimit) : posts;
			totalExportedPosts += limitedPosts.length;

			for (const post of limitedPosts) {
				const postTitle = convertEscapedAscii(post.title.rendered);
				console.log("Exporting post:", postTitle);

				let postAuthor = authors.find(
					(author) => Number(author.wordpressId) === Number(post.author)
				);

				if (!postAuthor) {
					console.warn(
						`Warning: Author not found for post "${postTitle}" (ID: ${post.author})`
					);
					postAuthor = { name: "Unknown Author" };
				}

				const pathToPostFolder = path.resolve(dataDirectory, "posts", post.slug);

				if (!fs.existsSync(pathToPostFolder)) {
					await fs.promises.mkdir(pathToPostFolder, { recursive: true });
				}

				const postCategories = categories.filter((category) =>
					post.categories.includes(category.wordpressId)
				);

				const titleImageId = post.featured_media;
				const titleImageResponse = await fetch(`${mediaUrl}/${titleImageId}`);
				const titleImageJson = await titleImageResponse.json();
				const titleImage = await downloadPostImage(
					titleImageJson.source_url,
					pathToPostFolder
				);

				const tags = [];

				for (const tag of post.tags) {
					const tagId = await fetchTag(tag);
					tags.push(tagId);
				}

				const cleanedContent = cleanUpHtml(post.content.rendered);
				const htmlWithImages = await downloadAndUpdateImages(
					cleanedContent,
					pathToPostFolder
				);

				const turndownService = new TurndownService({
					bulletListMarker: "-",
					codeBlockStyle: "fenced",
					emDelimiter: "*"
				});

				turndownService.keep(["figure", "figcaption"]);

				const content = turndownService.turndown(htmlWithImages);

				// Create frontmatter content
				// modified to only display the first category
				// if you want all categories, use the following line:
				// categories: postCategories.map(category => category.id),
				const frontmatter = {
					id: post.slug,
					title: postTitle,
					status: post.status === "publish" ? "published" : "draft",
					author: postAuthor.name,
					authorSlug: postAuthor.id,
					titleImage,
					categorySlug: postCategories.length > 0 ? postCategories[0].id : null,
					category: postCategories.length > 0 ? postCategories[0].name : null,
					publishedDate: post.date,
					updatedAt: post.modified,
					wordpressId: post.id
				};

				// Only add tags if showTags is true
				if (config.showTags) {
					frontmatter.tags = tags;
				}

				// Convert frontmatter to YAML format
				const yamlFrontmatter =
					"---\n" +
					Object.entries(frontmatter)
						.map(([key, value]) => {
							if (Array.isArray(value)) {
								return `${key}:\n${value.map((item) => `  - ${item}`).join("\n")}`;
							}
							return `${key}: ${typeof value === "string" ? `"${value}"` : value}`;
						})
						.join("\n") +
					"\n---\n\n";

				// Combine frontmatter with content
				const contentFile = path.resolve(pathToPostFolder, "index.md");
				await fs.promises.writeFile(contentFile, yamlFrontmatter + content);
			}
		};

		// Fetch total number of pages
		const totalPagesResponse = await fetch(`${postsUrl}?per_page=100`);
		const totalPages = parseInt(totalPagesResponse.headers.get("x-wp-totalpages"), 10);
		console.log(`Found ${totalPages} pages of posts`);

		// Process all pages
		for (let page = 1; page <= totalPages; page++) {
			console.log(`Fetching posts page ${page}/${totalPages}`);
			await importData(page);
		}

		console.log(`Successfully exported ${totalExportedPosts} posts`);
	} catch (error) {
		console.error("Error in fetchPosts:", error.message);
		throw error;
	}
}

/**
 * Fetches a tag by ID and returns its name
 * @param {number} tagId - WordPress tag ID
 * @returns {Promise<string>} Tag name
 */
async function fetchTag(tagId) {
	const response = await fetch(`${tagsUrl}/${tagId}`);
	const tag = await response.json();
	return tag.name;
}

// Main execution
try {
	await fetchAuthors();
	await fetchCategories();
	await fetchPosts();

	// Report any failed image downloads
	if (imagesNotDownloaded.length > 0) {
		console.log("The following images could not be downloaded:");
		console.log(JSON.stringify(imagesNotDownloaded, null, 2));
	}

	console.log("Data successfully exported from Wordpress!");
} catch (error) {
	console.error("Export failed:", error);
	process.exit(1);
}
