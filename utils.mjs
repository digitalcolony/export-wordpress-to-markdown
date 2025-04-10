import fs from "node:fs";
import { Readable } from "stream";
import { finished } from "stream/promises";
import cliProgress from "cli-progress";

export async function fetchWithRetry(url, retries = 3) {
	for (let i = 0; i < retries; i++) {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			return response;
		} catch (error) {
			if (i === retries - 1) throw error;
			await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
		}
	}
}

export async function downloadImage(imageUrl, destination) {
	if (fs.existsSync(destination)) {
		console.log("File already exists:", destination);
		return true;
	}

	try {
		const response = await fetchWithRetry(imageUrl);
		const fileStream = fs.createWriteStream(destination, { flags: "wx" });
		await finished(Readable.fromWeb(response.body).pipe(fileStream));
		return true;
	} catch (error) {
		console.error("Failed to download image:", imageUrl, error);
		return false;
	}
}

export function createProgressBar() {
	return new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
}

export function convertEscapedAscii(string) {
	return string.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}

export function stripHtml(string) {
	return string.replace(/<[^>]*>/g, "");
}

export function validateApiResponse(response, expectedKeys) {
	if (!response || typeof response !== "object") {
		throw new Error("Invalid API response format");
	}

	for (const key of expectedKeys) {
		if (!(key in response)) {
			throw new Error(`Missing required field: ${key}`);
		}
	}
}
