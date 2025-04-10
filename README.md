# export-wordpress-to-markdown

Status: Working, but will make a few minor changes this month. - April 2025

This is a script that imports WordPress posts and their images to Markdown files.

It will also export authors, categories and tags to JSON files. These will be linked to the exported posts.

This is a fork of [Alex Seifert's export-wordpress-to-markdown](https://github.com/eiskalteschatten/export-wordpress-to-markdown) with added frontmatter support.

## Changes in this Fork

- Adds YAML frontmatter to each exported post with:
    - id: post slug
    - title: post title
    - status: publish status
    - author: author name
    - titleImage: featured image filename
    - category: primary category
    - publishedDate: original publish date
    - updatedAt: last modified date
    - wordpressId: original WordPress post ID

## Usage

The script is easy to use. It requires Node.js 18+ (lower versions might work, but aren't tested).

Once you've cloned the repository, you just need to follow the following steps:

1. Run `npm install`
2. Create a `config.mjs` file with your WordPress API URL:

```javascript
export const config = {
	apiUrl: "https://your-wordpress-site.com/wp-json/wp/v2/",
	dataDirectory: "data",
	postsLimit: 5 // for testing, remove for all posts
};
```

3. Run `npm start`

That's it. The script will create a folder called `data` where everything will be saved.

## More Details

See the original author's blog post about this script for more details about the motivations behind it: https://blog.alexseifert.com/2024/05/30/a-script-for-exporting-wordpress-to-markdown/

## Credits

Original script by [Alex Seifert](https://www.alexseifert.com)
