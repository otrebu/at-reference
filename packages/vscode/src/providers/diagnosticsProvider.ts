import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { extractReferences, resolvePath } from '@at-reference/core';

export class AtReferenceDiagnosticsProvider implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('at-references');

    // Validate open documents
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (doc.languageId === 'markdown') {
          this.validateDocument(doc);
        }
      })
    );

    // Validate on save
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.languageId === 'markdown') {
          this.validateDocument(doc);
        }
      })
    );

    // Validate on change (debounced)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId === 'markdown') {
          this.debouncedValidate(e.document);
        }
      })
    );

    // Clear diagnostics when document closes
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((doc) => {
        this.diagnosticCollection.delete(doc.uri);
        this.debounceTimers.delete(doc.uri.toString());
      })
    );

    // Validate all open markdown documents
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.languageId === 'markdown') {
        this.validateDocument(doc);
      }
    }
  }

  private debouncedValidate(document: vscode.TextDocument) {
    const key = document.uri.toString();
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.validateDocument(document);
      this.debounceTimers.delete(key);
    }, 500);

    this.debounceTimers.set(key, timer);
  }

  private validateDocument(document: vscode.TextDocument) {
    const refs = extractReferences(document.getText(), { zeroIndexed: true });
    const diagnostics: vscode.Diagnostic[] = [];

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const documentDir = path.dirname(document.uri.fsPath);

    for (const ref of refs) {
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

      if (!resolved.exists) {
        const range = new vscode.Range(
          ref.line,
          ref.column,
          ref.line,
          ref.column + ref.raw.length
        );

        const diagnostic = new vscode.Diagnostic(
          range,
          `File not found: ${resolved.resolvedPath}`,
          vscode.DiagnosticSeverity.Error
        );
        diagnostic.source = 'at-reference';
        diagnostics.push(diagnostic);
      }
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  dispose() {
    this.diagnosticCollection.dispose();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
