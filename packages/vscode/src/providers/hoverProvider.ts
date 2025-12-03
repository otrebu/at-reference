import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { extractReferences, resolvePath, AtReference } from '@at-reference/core';
import { getConfig } from '../config';

export class AtReferenceHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | null {
    const ref = this.getReferenceAtPosition(document, position);
    if (!ref) {
      return null;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const documentDir = path.dirname(document.uri.fsPath);

    let basePath: string;
    let refPath = ref.path;

    if (refPath.startsWith('./') || refPath.startsWith('../')) {
      basePath = documentDir;
    } else if (refPath.startsWith('/')) {
      basePath = workspaceFolder?.uri.fsPath ?? documentDir;
      refPath = refPath.slice(1);
    } else {
      basePath = workspaceFolder?.uri.fsPath ?? documentDir;
    }

    const resolved = resolvePath(refPath, { basePath });

    if (resolved.exists) {
      return this.createPreviewHover(resolved.resolvedPath, ref);
    } else {
      return this.createErrorHover(resolved.resolvedPath);
    }
  }

  private getReferenceAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
  ): AtReference | null {
    const refs = extractReferences(document.getText(), { zeroIndexed: true });

    for (const ref of refs) {
      if (ref.line !== position.line) {
        continue;
      }

      const startCol = ref.column;
      const endCol = ref.column + ref.raw.length;

      if (position.character >= startCol && position.character <= endCol) {
        return ref;
      }
    }

    return null;
  }

  private createPreviewHover(
    resolvedPath: string,
    ref: AtReference
  ): vscode.Hover {
    const config = getConfig();
    const hover = new vscode.MarkdownString();

    try {
      if (fs.statSync(resolvedPath).isDirectory()) {
        hover.appendMarkdown(`**Directory:** \`${ref.path}\`\n\n`);
        const entries = fs.readdirSync(resolvedPath).slice(0, 10);
        hover.appendMarkdown('Contents:\n');
        for (const entry of entries) {
          hover.appendMarkdown(`- ${entry}\n`);
        }
        if (fs.readdirSync(resolvedPath).length > 10) {
          hover.appendMarkdown('- ...\n');
        }
      } else {
        const content = fs.readFileSync(resolvedPath, 'utf-8');
        const lines = content.split('\n').slice(0, config.previewLines);
        const preview = lines.join('\n');

        const ext = path.extname(resolvedPath).slice(1);
        const languageId = this.getLanguageId(ext);

        hover.appendCodeblock(preview, languageId);
      }

      hover.appendMarkdown(`\n\n*${resolvedPath}*`);
    } catch {
      hover.appendMarkdown(`**File:** \`${ref.path}\`\n\nCould not read file contents.`);
    }

    return new vscode.Hover(hover);
  }

  private createErrorHover(resolvedPath: string): vscode.Hover {
    const hover = new vscode.MarkdownString();
    hover.appendMarkdown(`**File not found**\n\n`);
    hover.appendMarkdown(`Expected path: \`${resolvedPath}\``);
    return new vscode.Hover(hover);
  }

  private getLanguageId(ext: string): string {
    const map: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescriptreact',
      js: 'javascript',
      jsx: 'javascriptreact',
      json: 'json',
      md: 'markdown',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      css: 'css',
      scss: 'scss',
      html: 'html',
      yaml: 'yaml',
      yml: 'yaml',
      toml: 'toml',
      sh: 'shellscript',
      bash: 'shellscript',
    };

    return map[ext] ?? ext;
  }
}
