import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { extractReferences, resolvePath } from '@at-reference/core';
import { getConfig } from '../config';

export class AtReferenceDiagnosticsProvider implements vscode.Disposable {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private fsWatcherTimer?: NodeJS.Timeout;
  private excludePatterns: string[];
  private referencedFiles = new Set<string>();

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('at-references');
    this.excludePatterns = getConfig().exclude;

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
        // Rebuild referencedFiles from remaining open documents
        this.rebuildReferencedFilesSet();
      })
    );

    // Watch for file system changes to referenced files
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    this.disposables.push(fileWatcher);

    this.disposables.push(
      fileWatcher.onDidCreate((uri) => {
        if (!this.shouldExclude(uri.fsPath) && this.referencedFiles.has(uri.fsPath)) {
          this.debouncedRevalidateAll();
        }
      })
    );
    this.disposables.push(
      fileWatcher.onDidDelete((uri) => {
        if (!this.shouldExclude(uri.fsPath) && this.referencedFiles.has(uri.fsPath)) {
          this.debouncedRevalidateAll();
        }
      })
    );

    // Validate all open markdown documents initially
    this.revalidateAllOpenDocuments();
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

  private shouldExclude(filePath: string): boolean {
    // Simple pattern matching for common exclude patterns
    // **/*pattern*/** → check if path contains /pattern/
    for (const pattern of this.excludePatterns) {
      const cleanPattern = pattern.replace(/^\*\*\//, '').replace(/\/\*\*$/, '');
      if (filePath.includes(`/${cleanPattern}/`) || filePath.includes(`\\${cleanPattern}\\`)) {
        return true;
      }
    }
    return false;
  }

  private debouncedRevalidateAll(): void {
    if (this.fsWatcherTimer) {
      clearTimeout(this.fsWatcherTimer);
    }

    this.fsWatcherTimer = setTimeout(() => {
      this.revalidateAllOpenDocuments();
      this.fsWatcherTimer = undefined;
    }, 250);
  }

  private rebuildReferencedFilesSet(): void {
    this.referencedFiles.clear();

    for (const doc of vscode.workspace.textDocuments) {
      if (doc.languageId === 'markdown') {
        const refs = extractReferences(doc.getText(), { zeroIndexed: true });
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
        const documentDir = path.dirname(doc.uri.fsPath);

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
          this.referencedFiles.add(resolved.resolvedPath);
        }
      }
    }
  }

  private revalidateAllOpenDocuments(): void {
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.languageId === 'markdown') {
        this.validateDocument(doc);
      }
    }
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

      // Track this file as referenced
      this.referencedFiles.add(resolved.resolvedPath);

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
    if (this.fsWatcherTimer) {
      clearTimeout(this.fsWatcherTimer);
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
