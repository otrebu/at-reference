import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AtReferenceLinkProvider } from './providers/documentLinkProvider';
import { AtReferenceDiagnosticsProvider } from './providers/diagnosticsProvider';
import { AtReferenceHoverProvider } from './providers/hoverProvider';
import { AtReferenceCompletionProvider } from './providers/completionProvider';
import { getConfig } from './config';
import { compileFile, getBuiltOutputPath } from '@at-reference/core';

export function activate(context: vscode.ExtensionContext) {
  console.log('At Reference Support activated');

  const config = getConfig();

  // Document links - always enabled for navigation
  const linkProvider = new AtReferenceLinkProvider();
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      { language: 'markdown' },
      linkProvider
    )
  );

  // Diagnostics
  if (config.enableDiagnostics) {
    const diagnosticsProvider = new AtReferenceDiagnosticsProvider();
    context.subscriptions.push(diagnosticsProvider);
  }

  // Hover
  if (config.enableHover) {
    const hoverProvider = new AtReferenceHoverProvider();
    context.subscriptions.push(
      vscode.languages.registerHoverProvider(
        { language: 'markdown' },
        hoverProvider
      )
    );
  }

  // Completion
  if (config.enableCompletion) {
    const completionProvider = new AtReferenceCompletionProvider();
    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        { language: 'markdown' },
        completionProvider,
        '@', '/'
      )
    );
  }

  // Compile file command
  context.subscriptions.push(
    vscode.commands.registerCommand('atReference.compileFile', async (uri?: vscode.Uri) => {
      // Get the file URI - either from context menu or active editor
      let fileUri = uri;
      if (!fileUri && vscode.window.activeTextEditor) {
        fileUri = vscode.window.activeTextEditor.document.uri;
      }

      if (!fileUri) {
        vscode.window.showErrorMessage('No file selected to compile');
        return;
      }

      const filePath = fileUri.fsPath;

      if (!filePath.endsWith('.md')) {
        vscode.window.showErrorMessage('Only markdown files can be compiled');
        return;
      }

      try {
        const result = compileFile(filePath);

        if (result.failedCount > 0) {
          const failedRefs = result.references
            .filter(r => !r.found)
            .map(r => r.reference.raw)
            .join(', ');
          vscode.window.showWarningMessage(
            `Compiled with ${result.failedCount} unresolved reference(s): ${failedRefs}`
          );
        }

        vscode.window.showInformationMessage(
          `Compiled ${result.successCount} reference(s) → ${path.basename(result.outputPath)}`
        );

        // Open the compiled file
        const doc = await vscode.workspace.openTextDocument(result.outputPath);
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to compile: ${err}`);
      }
    })
  );

  // Compile folder command
  context.subscriptions.push(
    vscode.commands.registerCommand('atReference.compileFolder', async (uri?: vscode.Uri) => {
      if (!uri) {
        vscode.window.showErrorMessage('No folder selected');
        return;
      }

      const folderPath = uri.fsPath;

      // Find all markdown files in folder
      const markdownFiles = findMarkdownFiles(folderPath);

      if (markdownFiles.length === 0) {
        vscode.window.showInformationMessage('No markdown files found in folder');
        return;
      }

      const results = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Compiling @references',
          cancellable: false,
        },
        async (progress) => {
          const compiled: Array<{ file: string; success: number; failed: number }> = [];
          const totalFiles = markdownFiles.length;

          for (const [index, file] of markdownFiles.entries()) {
            progress.report({
              message: `${index + 1}/${totalFiles}: ${path.basename(file)}`,
              increment: (100 / totalFiles),
            });

            try {
              const result = compileFile(file);
              compiled.push({
                file: path.basename(file),
                success: result.successCount,
                failed: result.failedCount,
              });
            } catch {
              compiled.push({
                file: path.basename(file),
                success: 0,
                failed: -1, // indicates error
              });
            }
          }

          return compiled;
        }
      );

      const totalSuccess = results.reduce((sum, r) => sum + r.success, 0);
      const totalFailed = results.filter(r => r.failed > 0).length;
      const totalErrors = results.filter(r => r.failed === -1).length;

      let message = `Compiled ${markdownFiles.length} file(s), ${totalSuccess} reference(s) resolved`;
      if (totalFailed > 0) {
        message += `, ${totalFailed} file(s) with unresolved references`;
      }
      if (totalErrors > 0) {
        message += `, ${totalErrors} error(s)`;
      }

      vscode.window.showInformationMessage(message);
    })
  );
}

function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist'].includes(entry.name)) {
            walk(fullPath);
          }
        } else if (entry.name.endsWith('.md') && !entry.name.includes('.built.')) {
          files.push(fullPath);
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  walk(dir);
  return files;
}

export function deactivate() {}
