import * as vscode from 'vscode';
import * as path from 'path';
import { getConfig } from '../config';

export class AtReferenceCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[]> {
    if (!this.shouldTrigger(document, position)) {
      return [];
    }

    const partial = this.getPartialPath(document, position);
    const files = await this.findMatchingFiles(document.uri, partial);

    return files.map((file) => this.createCompletionItem(file, document.uri));
  }

  private shouldTrigger(
    document: vscode.TextDocument,
    position: vscode.Position
  ): boolean {
    const linePrefix = document.lineAt(position).text.substring(0, position.character);

    // Check if we're after an @
    const atIndex = linePrefix.lastIndexOf('@');
    if (atIndex === -1) {
      return false;
    }

    // Make sure @ is at start or after whitespace/bracket
    if (atIndex > 0) {
      const charBefore = linePrefix[atIndex - 1];
      if (charBefore && !/[\s\[\(\{]/.test(charBefore)) {
        return false;
      }
    }

    return true;
  }

  private getPartialPath(
    document: vscode.TextDocument,
    position: vscode.Position
  ): string {
    const linePrefix = document.lineAt(position).text.substring(0, position.character);
    const atIndex = linePrefix.lastIndexOf('@');

    if (atIndex === -1) {
      return '';
    }

    return linePrefix.substring(atIndex + 1);
  }

  private async findMatchingFiles(
    documentUri: vscode.Uri,
    partial: string
  ): Promise<vscode.Uri[]> {
    const config = getConfig();
    const excludePattern = `{${config.exclude.join(',')}}`;

    // Build search pattern
    let searchPattern = '**/*';
    if (partial) {
      searchPattern = `**/${partial}*`;
    }

    const files = await vscode.workspace.findFiles(
      searchPattern,
      excludePattern,
      50
    );

    return files;
  }

  private createCompletionItem(
    fileUri: vscode.Uri,
    documentUri: vscode.Uri
  ): vscode.CompletionItem {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);
    const basePath = workspaceFolder?.uri.fsPath ?? path.dirname(documentUri.fsPath);

    const relativePath = path.relative(basePath, fileUri.fsPath);
    const label = relativePath;

    const item = new vscode.CompletionItem(
      label,
      this.getCompletionKind(fileUri.fsPath)
    );

    item.insertText = relativePath;
    item.filterText = relativePath;
    item.detail = fileUri.fsPath;
    item.sortText = relativePath;

    return item;
  }

  private getCompletionKind(filePath: string): vscode.CompletionItemKind {
    const ext = path.extname(filePath).toLowerCase();

    const fileKinds: Record<string, vscode.CompletionItemKind> = {
      '.ts': vscode.CompletionItemKind.File,
      '.tsx': vscode.CompletionItemKind.File,
      '.js': vscode.CompletionItemKind.File,
      '.jsx': vscode.CompletionItemKind.File,
      '.json': vscode.CompletionItemKind.File,
      '.md': vscode.CompletionItemKind.File,
    };

    return fileKinds[ext] ?? vscode.CompletionItemKind.File;
  }
}
