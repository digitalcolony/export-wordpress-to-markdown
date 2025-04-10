import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";
import { fetchWithRetry } from "./utils.mjs";

export async function fetchAuthors() {
	console.log("Exporting authors...");

	const dataDirectory = path.resolve(process.cwd(), config.dataDirectory);
	const authorsDirectory = path.resolve(dataDirectory, "authors");
	const authorsFile = path.resolve(authorsDirectory, "authors.json");

	if (!fs.existsSync(authorsDirectory)) {
		await fs.promises.mkdir(authorsDirectory, { recursive: true });
	}

	let newAuthors = [];
	if (fs.existsSync(authorsFile)) {
		const existingAuthors = await fs.promises.readFile(authorsFile, "utf8");
		newAuthors = JSON.parse(existingAuthors);
	}

	const initialResponse = await fetchWithRetry(`${config.apiUrl}users`);
	const totalPages = parseInt(initialResponse.headers.get("x-wp-totalpages"), 10);
	console.log(`Found ${totalPages} pages of authors`);

	for (let page = 1; page <= totalPages; page++) {
		console.log(`Fetching authors page ${page}/${totalPages}`);
		const response = await fetchWithRetry(`${config.apiUrl}users?page=${page}&per_page=100`);
		const authors = await response.json();

		for (const author of authors) {
			const existingAuthorIndex = newAuthors.findIndex(
				(existingAuthor) => Number(existingAuthor.wordpressId) === Number(author.id)
			);

			if (existingAuthorIndex > -1) {
				console.log(`Author "${author.name}" already exists, skipping...`);
				continue;
			}

			console.log(`Adding author: ${author.name} (ID: ${author.id})`);
			newAuthors.push({
				id: author.slug,
				name: author.name,
				wordpressId: Number(author.id)
			});
		}
	}

	await fs.promises.writeFile(authorsFile, JSON.stringify(newAuthors, null, 2));
	console.log(`Saved ${newAuthors.length} authors to ${authorsFile}`);
	return newAuthors;
}
