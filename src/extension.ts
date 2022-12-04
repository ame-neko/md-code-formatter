// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
const unified = require("unified");
const remarkParse = require("remark-parse");
const remarkGfm = require("remark-gfm");

interface CodeBlock {
  language: string;
  range: vscode.Range;
  text: string;
  indent: number,
}

interface IndentConfig {
  useSpace: boolean;
  tabSize: number;
}

const DEFAULT_TIMEOUT_MS: number = 1000;

const processedLanguagees: Set<string> = new Set();

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let disposableFormat = vscode.commands.registerCommand("markdown-code-block-formatter.format", async () => {
    format(false, false);
  });
  context.subscriptions.push(disposableFormat);

  let disposableFormatAll = vscode.commands.registerCommand("markdown-code-block-formatter.formatAll", async () => {
    format(true, false);
  });
  context.subscriptions.push(disposableFormatAll);

  let disposableMinify = vscode.commands.registerCommand("markdown-code-block-formatter.minify", async () => {
    format(false, true);
  });
  context.subscriptions.push(disposableMinify);

  let disposableMinifyAll = vscode.commands.registerCommand("markdown-code-block-formatter.minifyAll", async () => {
    format(true, true);
  });
  context.subscriptions.push(disposableMinifyAll);
}

const format = async (formatAll: boolean, minify: boolean) => {
  const initialDocumentUri = vscode.window.activeTextEditor?.document.uri;
  if (!initialDocumentUri) {
    vscode.window.showErrorMessage("Failed to get uri of current active document.");
    return;
  }

  let codeBlocks: CodeBlock[] | null = null;
  if (vscode.window.activeTextEditor) {
    codeBlocks = getCodeBlocks(vscode.window.activeTextEditor?.selection.active.line, vscode.window.activeTextEditor?.document.getText(), formatAll);
  }
  if (!codeBlocks) {
    vscode.window.showErrorMessage("Failed to get contents of code block.");
    return;
  }
  // sort reversed order so that edit does not affect other code block edit
  codeBlocks.sort((a, b) => b.range.start.line - a.range.start.line);
  for (const codeBlock of codeBlocks) {
    await formatCodeBlock(codeBlock, initialDocumentUri, minify);
  }
};

const formatCodeBlock = async (codeBlock: CodeBlock, initialDocumentUri: vscode.Uri, minify: boolean) => {
  const formattedCode = minify ? getMinifiedCode(codeBlock) : await getFormattedCode(codeBlock); //minify ? getMinifiedCode(codeBlock) :
  if (formattedCode === null) {
    vscode.window.showErrorMessage(`Failed to get ${minify ? "minified" : "formatted"} code block content.`);
    return;
  }

  const initialDoc = await vscode.workspace.openTextDocument(initialDocumentUri);
  await vscode.window.showTextDocument(initialDoc);
  const initialDocumentEditor = vscode.window.activeTextEditor;
  if (!initialDocumentEditor) {
    vscode.window.showErrorMessage("Failed to get editor of current active document");
    return;
  }

  initialDocumentEditor.edit((builder) => {
    if (codeBlock && formattedCode) {
      builder.replace(codeBlock.range, addIndentToCodeBlock(formattedCode, codeBlock.indent));
    } else {
      vscode.window.showErrorMessage("Failed to format code block content.");
    }
  });
};

const decideLanguage = (languageOfCodeBlock: string | null): string | null => {
  const configurations = vscode.workspace.getConfiguration("markdown-code-block-formatter");
  if (languageOfCodeBlock === null) {
    const defaultLang = configurations.get("defaultLanguage");
    if (defaultLang && typeof defaultLang === "string") {
      return defaultLang;
    } else {
      return null;
    }
  }
  const languageMapping: { [key: string]: string } | undefined = configurations.get("languageNameMapping");
  if (languageMapping && typeof languageMapping === "object" && languageOfCodeBlock in languageMapping) {
    return languageMapping[languageOfCodeBlock];
  }
  return languageOfCodeBlock;
};

const findCodeBlockElement = (currentLine: number, parseResult: any, formatAll: boolean, elements: CodeBlock[]): CodeBlock[] | null => {
  if (parseResult?.children) {
    for (const element of parseResult?.children) {
      if (
        element?.type === "code" &&
        element?.value !== undefined &&
        element?.value !== null &&
        (formatAll || (element?.position?.start?.line <= currentLine + 1 && element?.position?.end?.line >= currentLine + 1))
      ) {
        const offset = 1; // line number starts from 1
        const startLine = element.position.start.line - offset + 1; // + 1 to ignore first line
        const endLine = element.position.end.line - offset - 1; // - 1 to ignore last line
        const endRange = vscode.window.activeTextEditor?.document.lineAt(endLine).range.end;

        if (!endRange) {
          return null;
        }
        const language = decideLanguage(element.lang);
        if (!language) {
          vscode.window.showErrorMessage("Language of code block is unknown.");
          return null;
        }
        vscode.languages.getLanguages().then((supportedLanguages) => {
          if (!supportedLanguages.includes(language)) {
            vscode.window.showWarningMessage(`Language id "${language}" is unkown. Supported languages are: [${supportedLanguages.join(", ")}]`);
          }
        });

        elements.push({
          language: language,
          range: new vscode.Range(new vscode.Position(startLine, 0), endRange),
          text: element.value,
          indent: element.position.start.column - 1
        });
        if (!formatAll) {
          return elements;
        }
      }
      // dfs
      findCodeBlockElement(currentLine, element, formatAll, elements);
      if (!formatAll && elements.length > 0) {
        return elements;
      }
    }
  }
  return elements;
};

const getCodeBlocks = (currentLine: number, markdownText: string, formatAll: boolean): CodeBlock[] | null => {
  const parseResult = unified().use(remarkParse).use(remarkGfm).parse(markdownText);
  return findCodeBlockElement(currentLine, parseResult, formatAll, []);
};

const minifyJson = (codeBlock: CodeBlock): string => {
  return JSON.stringify(JSON.parse(codeBlock.text));
};

const getMinifiedCode = (codeBlock: CodeBlock): string | null => {
  switch (codeBlock.language) {
    case "json":
      return minifyJson(codeBlock);
    default:
      vscode.window.showWarningMessage("Minify of code block is only supported for JSON.");
      return null;
  }
};

const formatUntilDocChange = async (doc: vscode.TextDocument) => {
  const configurations = vscode.workspace.getConfiguration("markdown-code-block-formatter");

  let timeoutMs: number | undefined = configurations.get("waitLanguageActivatedTimeoutMs");
  if (timeoutMs === undefined) {
    timeoutMs = DEFAULT_TIMEOUT_MS;
  }

  let isDocumentChanged = false;
  const disposable = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document === doc) {
      isDocumentChanged = true;
    }
  });
  const start = Date.now();
  while (!isDocumentChanged && Date.now() - start < timeoutMs) {
    await vscode.commands.executeCommand("editor.action.formatDocument", doc.uri);
    if (isDocumentChanged) {
      break;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  disposable.dispose();
};

const getFormattedCode = async (codeBlock: CodeBlock): Promise<string | undefined> => {
  const doc = await vscode.workspace.openTextDocument({ language: codeBlock.language, content: codeBlock.text });
  const editor = await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
  if (processedLanguagees.has(codeBlock.language)) {
    await vscode.commands.executeCommand("editor.action.formatDocument", doc.uri);
  } else {
    processedLanguagees.add(codeBlock.language);
    await formatUntilDocChange(doc);
  }
  let text;
  if (editor) {
    text = editor.document.getText();
    // close the editor
    await editor.edit((builder) => {
      // delete the contents so that no dialogue is shown
      const lineNum = editor.document.lineCount;
      builder.delete(new vscode.Range(new vscode.Position(0, 0), editor.document.lineAt(lineNum - 1).range.end));
    });
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor", doc.uri);
  }
  return text;
};

const loadIndentConfig = (defaultSize = 4, defaultUseSpace = true): IndentConfig => {
  const activeTextTabSize = vscode.window.activeTextEditor?.options.tabSize ?? defaultSize;
  const useSpace = vscode.window.activeTextEditor?.options.insertSpaces ?? defaultUseSpace;

  return {
    useSpace: typeof useSpace === "boolean" ? useSpace : useSpace === "true",
    tabSize: typeof activeTextTabSize === "number" ? activeTextTabSize : parseInt(activeTextTabSize),
  };
};

const addIndentToCodeBlock = (formattedCode: string, indentNum: number): string => {
  const indentConfig = loadIndentConfig();
  const indent = indentConfig.useSpace ? " ".repeat(indentNum) : "\t".repeat(indentNum);
  const eol = vscode.window.activeTextEditor?.document.eol === 1 ? "\n" : "\r\n";
  const lines = formattedCode.split(/\r?\n/); // support crlf or lf
  return lines.map((line) => indent + line).join(eol);
};

// this method is called when your extension is deactivated
export function deactivate() { }
