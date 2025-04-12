export const config = {
	apiUrl: "https://example.com/wp-json/wp/v2/", // Replace with your WordPress API URL
	dataDirectory: "data",
	postsLimit: 0, // set to 0 for all posts
	showTags: false, // set to true to include tags in frontmatter
	turndownOptions: {
		bulletListMarker: "-",
		codeBlockStyle: "fenced",
		emDelimiter: "*"
	}
};
