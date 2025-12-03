import * as vscode from 'vscode';
import * as path from 'path';
import { extractReferences } from '@at-reference/core';

export class AtReferenceLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const refs = extractReferences(document.getText(), { zeroIndexed: true });
    const links: vscode.DocumentLink[] = [];

    for (const ref of refs) {
      const range = new vscode.Range(
        ref.line,
        ref.column,
        ref.line,
        ref.column + ref.raw.length
      );

      const targetUri = this.resolveUri(ref.path, document.uri);
      if (targetUri) {
        const link = new vscode.DocumentLink(range, targetUri);
        link.tooltip = `Open ${ref.path}`;
        links.push(link);
      }
    }

    return links;
  }

  private resolveUri(refPath: string, documentUri: vscode.Uri): vscode.Uri | undefined {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(documentUri);

    let basePath: string;
    if (refPath.startsWith('./') || refPath.startsWith('../')) {
      // Relative to document
      basePath = path.dirname(documentUri.fsPath);
    } else if (refPath.startsWith('/')) {
      // Root-relative to workspace
      basePath = workspaceFolder?.uri.fsPath ?? path.dirname(documentUri.fsPath);
      refPath = refPath.slice(1);
    } else {
      // Bare path - relative to workspace root
      basePath = workspaceFolder?.uri.fsPath ?? path.dirname(documentUri.fsPath);
    }

    const resolvedPath = path.resolve(basePath, refPath);
    return vscode.Uri.file(resolvedPath);
  }
}
