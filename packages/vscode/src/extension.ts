import * as vscode from 'vscode';
import { AtReferenceLinkProvider } from './providers/documentLinkProvider';
import { AtReferenceDiagnosticsProvider } from './providers/diagnosticsProvider';
import { AtReferenceHoverProvider } from './providers/hoverProvider';
import { AtReferenceCompletionProvider } from './providers/completionProvider';
import { getConfig } from './config';

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
}

export function deactivate() {}
