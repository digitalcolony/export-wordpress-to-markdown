# export-wordpress-to-markdown

This is a script that imports WordPress posts and their images to Markdown files.

It will also export authors, categories and tags to JSON files. These will be linked to the exported posts.

This is a fork of [Alex Seifert's export-wordpress-to-markdown](https://github.com/eiskalteschatten/export-wordpress-to-markdown) with added frontmatter support.

## Changes in this Fork

- Adds YAML frontmatter to each exported post with:
    - id: post slug
    - title: post title
    - status: publish status
    - author: author name
    - authorSlug: author's URL slug
    - titleImage: featured image filename
    - categorySlug: primary category URL slug
    - category: primary category name
    - publishedDate: original publish date
    - updatedAt: last modified date
    - wordpressId: original WordPress post ID

## Usage

The script requires Node.js 18+ (lower versions might work, but aren't tested).

1. Clone this repository
2. Run `npm install`
3. Create a `config.mjs` file with your settings:

```javascript
export const config = {
	apiUrl: "https://your-wordpress-site.com/wp-json/wp/v2/",
	dataDirectory: "data",
	postsLimit: 0, // 0 for all posts, or number for testing
	showTags: false, // true to include tags in frontmatter
	turndownOptions: {
		bulletListMarker: "-",
		codeBlockStyle: "fenced",
		emDelimiter: "*"
	}
};
```

4. Run `npm start`

## Output Structure

The script creates a `data` folder with:

```
data/
├── authors/
│   └── authors.json       # Author information
├── categories.json       # Category information
└── posts/
    └── post-slug/
        ├── index.md     # Post content with frontmatter
        └── images/      # Downloaded images
```

## Features

- Downloads all posts with pagination support
- Preserves images and updates their paths
- Converts HTML to Markdown
- Maintains author and category relationships
- Handles special content (polls, embedded content)
- Retries failed downloads automatically

## Configuration Options

- `apiUrl`: Your WordPress site's REST API URL
- `dataDirectory`: Where to save exported content
- `postsLimit`: Number of posts to export (0 for all)
- `showTags`: Include tags in post frontmatter
- `turndownOptions`: HTML to Markdown conversion settings

## More Details

See the original author's blog post about this script: [A Script for Exporting WordPress to Markdown](https://blog.alexseifert.com/2024/05/30/a-script-for-exporting-wordpress-to-markdown/)

## Credits

Original script by [Alex Seifert](https://www.alexseifert.com)  
Frontmatter additions by Michael Allen Smith
