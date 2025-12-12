import * as vscode from 'vscode';

export interface ExtensionConfig {
  enableDiagnostics: boolean;
  enableCompletion: boolean;
  enableHover: boolean;
  exclude: string[];
  previewLines: number;
  compileOptimizeDuplicates: boolean;
}

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('atReference');

  return {
    enableDiagnostics: config.get<boolean>('enableDiagnostics', true),
    enableCompletion: config.get<boolean>('enableCompletion', true),
    enableHover: config.get<boolean>('enableHover', true),
    exclude: config.get<string[]>('exclude', ['**/node_modules/**', '**/.git/**']),
    previewLines: config.get<number>('previewLines', 10),
    compileOptimizeDuplicates: config.get<boolean>('compile.optimizeDuplicates', true),
  };
}
