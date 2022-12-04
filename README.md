# Markdown Code Block Formatter

This extension formats contents of code block of markdown file.

## Features
* Format code block
    ![](https://github.com/ame-neko/md-code-formatter/blob/main/images/format-code-block-demo.gif?raw=true)
  * Copy the contents of the code block into a temporary document, then format it.

* Minify code block 
  * Currently only JSON code block is supported
    ![](https://github.com/ame-neko/md-code-formatter/blob/main/images/minify-code-block-demo.gif?raw=true)

## Extension Settings

| Settings name                                                  | Description                                                                                                           | Default |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------- |
| `markdown-code-block-formatter.defaultLanguage`                | Deefault language of code block. This language is used when language of code block is filled.                         | `N/A`   |
| `markdown-code-block-formatter.languageNameMapping`            | Mapping of language name of code block to language id used to format code block. For example: `{ "js": "javascript" } | `N/A`   |
| `markdown-code-block-formatter.waitLanguageActivatedTimeoutMs` | Timeout milliseconds for waiting for initialization of language feature to complete.                                  | `1000`  |