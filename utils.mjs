import fs from "node:fs";
import { Readable } from "stream";
import { finished } from "stream/promises";

/**
 * Fetches a URL with retry logic for failed requests
 * - Handles both JSON API responses and image downloads
 * - Retries failed requests with exponential backoff
 * - Validates content types
 *
 * @param {string} url - URL to fetch
 * @param {number} retries - Number of retry attempts (default: 3)
 * @returns {Promise<Response>} Fetch response object
 * @throws {Error} If all retry attempts fail
 */
export async function fetchWithRetry(url, retries = 3) {
	for (let i = 0; i < retries; i++) {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			// Check if URL is for an image
			const contentType = response.headers.get("content-type");
			if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i) || contentType.includes("image/")) {
				return response;
			}

			// Otherwise, expect JSON
			if (!contentType || !contentType.includes("application/json")) {
				throw new Error(`Expected JSON but got ${contentType}`);
			}

			return response;
		} catch (error) {
			console.error(`Attempt ${i + 1} failed:`, error.message);
			if (i === retries - 1) throw error;
			// Exponential backoff: wait longer between each retry
			await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
		}
	}
}

/**
 * Downloads an image from a URL to a local file
 * - Skips if file already exists
 * - Creates write stream with exclusive flag
 * - Handles stream completion
 *
 * @param {string} imageUrl - URL of image to download
 * @param {string} destination - Local file path to save image
 * @returns {Promise<boolean>} True if successful, false if failed
 */
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

/**
 * Converts HTML escaped ASCII codes to characters
 * Example: &#65; -> A
 *
 * @param {string} string - Input string with HTML escaped codes
 * @returns {string} String with escaped codes converted to characters
 */
export function convertEscapedAscii(string) {
	return string.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}

/**
 * Removes all HTML tags from a string
 * Example: <p>Hello</p> -> Hello
 *
 * @param {string} string - Input string containing HTML
 * @returns {string} Clean string without HTML tags
 */
export function stripHtml(string) {
	return string.replace(/<[^>]*>/g, "");
}

/**
 * Validates that an API response contains required fields
 *
 * @param {Object} response - API response object to validate
 * @param {string[]} expectedKeys - Array of required field names
 * @throws {Error} If response is invalid or missing required fields
 */
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
