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
}

interface IndentConfig {
  useSpace: boolean;
  tabSize: number;
}

const myProvider = new (class implements vscode.TextDocumentContentProvider {
  provideTextDocumentContent(uri: vscode.Uri): string {
    // invoke cowsay, use uri-path as text
    return '{"hoge": "fuga"}';
  }
})();

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const providerDisposable = vscode.workspace.registerTextDocumentContentProvider("mdcformat", myProvider);
  context.subscriptions.push(providerDisposable);

  let disposable = vscode.commands.registerCommand("markdown-code-block-formatter.formatCodeBlock", async () => {
    const initialDocumentUri = vscode.window.activeTextEditor?.document.uri;
    if (!initialDocumentUri) {
      vscode.window.showErrorMessage("Failed to get uri of current active document.");
      return;
    }

    let codeBlock: CodeBlock | null = null;
    if (vscode.window.activeTextEditor) {
      codeBlock = getCodeBlock(vscode.window.activeTextEditor?.selection.active.line, vscode.window.activeTextEditor?.document.getText());
    }

    if (!codeBlock) {
      vscode.window.showErrorMessage("Failed to get contents of code block.");
      return;
    }

    const formattedCode = await getFormattedCode(codeBlock);
    if (formattedCode === null) {
      vscode.window.showErrorMessage("Failed to format code block content.");
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
        builder.replace(codeBlock.range, addIndentToCodeBlock(formattedCode));
      } else {
        vscode.window.showErrorMessage("Failed to format code block content.");
      }
    });
  });

  context.subscriptions.push(disposable);
}

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
    const lang = languageMapping[languageOfCodeBlock];
    return languageMapping[languageOfCodeBlock];
  }
  return languageOfCodeBlock;
};

const findCodeBlockElement = (currentLine: number, parseResult: any): CodeBlock | null => {
  if (parseResult?.children) {
    for (const element of parseResult?.children) {
      if (
        element?.type === "code" &&
        element?.value !== undefined &&
        element?.value !== null &&
        element?.position?.start?.line <= currentLine + 1 &&
        element?.position?.end?.line >= currentLine + 1
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
          if (!(language in supportedLanguages)) {
            vscode.window.showWarningMessage(`Language id "${language}" is unkown. Supported languages are: [${supportedLanguages.join(", ")}]`);
          }
        });

        return {
          language: language,
          range: new vscode.Range(new vscode.Position(startLine, 0), endRange),
          text: element.value,
        };
      }
      // dfs
      const res = findCodeBlockElement(currentLine, element);
      if (res !== undefined && res !== null) {
        return res;
      }
    }
  }
  return null;
};

const getCodeBlock = (currentLine: number, markdownText: string): CodeBlock | null => {
  const parseResult = unified().use(remarkParse).use(remarkGfm).parse(markdownText);
  return findCodeBlockElement(currentLine, parseResult);
};

const getFormattedCode = async (codeBlock: CodeBlock): Promise<string | undefined> => {
  let doc = await vscode.workspace.openTextDocument({ language: codeBlock.language, content: codeBlock.text });
  await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
  await vscode.commands.executeCommand("editor.action.formatDocument", doc.uri);
  const editor = vscode.window.activeTextEditor;
  let text;
  if (editor) {
    text = editor.document.getText();
    // close the editor
    editor.edit((builder) => {
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

const addIndentToCodeBlock = (formattedCode: string): string => {
  const indentConfig = loadIndentConfig();
  const indent = indentConfig.useSpace ? " ".repeat(indentConfig.tabSize) : "\t";
  const eol = vscode.window.activeTextEditor?.document.eol === 1 ? "\n" : "\r\n";
  const lines = formattedCode.split(/\r?\n/); // support crlf or lf
  return lines.map((line) => indent + line).join(eol);
};

// this method is called when your extension is deactivated
export function deactivate() {}
