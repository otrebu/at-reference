import * as vscode from 'vscode';
import * as path from 'path';
import { AtReferenceLinkProvider } from './providers/documentLinkProvider';
import { AtReferenceDiagnosticsProvider } from './providers/diagnosticsProvider';
import { AtReferenceHoverProvider } from './providers/hoverProvider';
import { AtReferenceCompletionProvider } from './providers/completionProvider';
import { AtReferenceDecorationProvider } from './providers/decorationProvider';
import { getConfig } from './config';
import { compileFile, compileFolder, getBuiltOutputPath } from '@at-reference/core';

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

  // Decorations - always enabled for visual feedback
  const decorationProvider = new AtReferenceDecorationProvider();
  context.subscriptions.push(decorationProvider);

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
        const compileConfig = getConfig();
        const result = compileFile(filePath, {
          basePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
          optimizeDuplicates: compileConfig.compileOptimizeDuplicates
        });

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
      const compileConfig = getConfig();

      // Output to dist/ at same level as folder (sibling)
      const outputDir = path.join(path.dirname(folderPath), 'dist');

      try {
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Compiling @references...',
            cancellable: false,
          },
          async () => {
            return compileFolder(folderPath, {
              outputDir,
              basePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
              optimizeDuplicates: compileConfig.compileOptimizeDuplicates
            });
          }
        );

        let message = `Compiled ${result.totalFiles} file(s) → ${path.basename(outputDir)}/`;
        if (result.totalFailures > 0) {
          message += ` (${result.totalFailures} unresolved reference(s))`;
        }
        vscode.window.showInformationMessage(message);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to compile folder: ${err}`);
      }
    })
  );
}

export function deactivate() {}
