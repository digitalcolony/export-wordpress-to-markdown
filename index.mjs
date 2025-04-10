import fs from "node:fs";
import path from "node:path";
import TurndownService from "turndown";
import * as cheerio from "cheerio";

import { downloadImage, convertEscapedAscii } from "./utils.mjs";
import { setupCleanup } from "./cleanup.mjs";
import { fetchAuthors } from "./authors.mjs";
import { config } from "./config.mjs";

setupCleanup();

console.log("Exporting data from Wordpress...");

const dataDirectory = path.resolve(process.cwd(), "data");
const categoriesFile = path.resolve(dataDirectory, "categories.json");
const authorsDirectory = path.resolve(dataDirectory, "authors");
const authorsFile = path.resolve(authorsDirectory, "authors.json");

const authorsUrl = `${config.apiUrl}users`;
const categoriesUrl = `${config.apiUrl}categories`;
const postsUrl = `${config.apiUrl}posts`;
const tagsUrl = `${config.apiUrl}tags`;
const mediaUrl = `${config.apiUrl}media`;

const imagesNotDownloaded = [];

if (!fs.existsSync(dataDirectory)) {
	fs.mkdirSync(dataDirectory);
}

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

async function fetchPosts() {
	console.log("Exporting posts...");

	try {
		//const totalPagesResponse = await fetch(postsUrl);
		//const totalPages = totalPagesResponse.headers.get("x-wp-totalpages");

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

		const downloadPostImage = async (src, pathToPostFolder) => {
			if (!src || !pathToPostFolder) {
				return;
			}

			const fileName = path.basename(src).split("?")[0];
			const destinationFile = path.resolve(pathToPostFolder, fileName);

			if (fs.existsSync(destinationFile)) {
				console.log(`Post image "${destinationFile}" already exists, skipping...`);
				return fileName;
			}

			const imageDownloaded = await downloadImage(src, destinationFile);

			if (!imageDownloaded) {
				imagesNotDownloaded.push(src);
			}

			return imageDownloaded ? fileName : undefined;
		};

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

		const importData = async (page) => {
			const response = await fetch(`${postsUrl}?page=${page}`);
			const posts = await response.json();

			// Limit to first 5 posts for testing
			const limitedPosts = posts.slice(0, 5);

			for (const post of limitedPosts) {
				const postTitle = convertEscapedAscii(post.title.rendered);
				console.log("\nExporting post:", postTitle);

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
				const frontmatter = {
					id: post.slug,
					title: postTitle,
					status: post.status === "publish" ? "published" : "draft",
					author: postAuthor.name,
					titleImage,
					category: postCategories.length > 0 ? postCategories[0].id : null,
					publishedDate: post.date,
					updatedAt: post.modified,
					wordpressId: post.id
				};

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

		for (let page = 1; page <= 1; page++) {
			// Changed from totalPages to 1
			await importData(page);
		}
	} catch (error) {
		console.error("Error in fetchPosts:", error.message);
		throw error;
	}
}

async function fetchTag(tagId) {
	const response = await fetch(`${tagsUrl}/${tagId}`);
	const tag = await response.json();
	return tag.name;
}

try {
	await fetchAuthors();
	await fetchCategories();
	await fetchPosts();

	if (imagesNotDownloaded.length > 0) {
		console.log("The following images could not be downloaded:");
		console.log(JSON.stringify(imagesNotDownloaded, null, 2));
	}

	console.log("Data successfully exported from Wordpress!");
} catch (error) {
	console.error("Export failed:", error);
	process.exit(1);
}
