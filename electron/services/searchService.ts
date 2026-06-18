import fs from 'fs';
import path from 'path';
import { queryOne } from './database';

export interface SearchOptions {
  query: string;
  scope: 'current_folder' | 'specified_folder' | 'workspace' | 'current_file';
  scopePath?: string;
  searchType: 'filename' | 'content' | 'tags' | 'status';
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
}

export interface SearchResult {
  filePath: string;
  fileName: string;
  lineNumber?: number;
  snippet: string;
  matchType: string;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPattern(query: string, options: SearchOptions): RegExp {
  let pattern = options.useRegex ? query : escapeRegex(query);
  if (options.wholeWord && !options.useRegex) {
    pattern = `\\b${pattern}\\b`;
  }
  const flags = options.caseSensitive ? 'g' : 'gi';
  return new RegExp(pattern, flags);
}

function getScopeFiles(scope: string, scopePath: string, workspacePath: string): string[] {
  const files: string[] = [];
  const markdownExt = ['.md', '.markdown', '.mdown', '.mkd'];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (markdownExt.includes(path.extname(fullPath).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  switch (scope) {
    case 'current_file':
      if (scopePath && fs.existsSync(scopePath)) files.push(scopePath);
      break;
    case 'current_folder':
      if (scopePath) walk(path.dirname(scopePath));
      break;
    case 'specified_folder':
      if (scopePath) walk(scopePath);
      break;
    case 'workspace':
    default:
      if (workspacePath) walk(workspacePath);
      break;
  }
  return files;
}

function searchInContent(filePath: string, pattern: RegExp): SearchResult[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const results: SearchResult[] = [];

  lines.forEach((line, index) => {
    if (pattern.test(line)) {
      pattern.lastIndex = 0;
      const snippet = line.trim().slice(0, 120);
      results.push({
        filePath,
        fileName: path.basename(filePath),
        lineNumber: index + 1,
        snippet,
        matchType: 'content',
      });
    }
    pattern.lastIndex = 0;
  });
  return results;
}

export function search(options: SearchOptions, workspacePath: string): SearchResult[] {
  if (!options.query.trim()) return [];

  const pattern = buildPattern(options.query, options);
  const scopePath = options.scopePath || workspacePath;
  const files = getScopeFiles(options.scope, scopePath, workspacePath);
  const results: SearchResult[] = [];

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const metaRow = queryOne('SELECT status, tags FROM file_meta WHERE file_path = ?', [filePath]);
    const status = (metaRow?.[0] as string) || 'in_progress';
    const tags = JSON.parse((metaRow?.[1] as string) || '[]') as string[];

    switch (options.searchType) {
      case 'filename':
        if (pattern.test(fileName)) {
          results.push({ filePath, fileName, snippet: fileName, matchType: 'filename' });
        }
        pattern.lastIndex = 0;
        break;
      case 'tags':
        for (const tag of tags) {
          if (pattern.test(tag)) {
            results.push({ filePath, fileName, snippet: `标签: ${tag}`, matchType: 'tags' });
          }
          pattern.lastIndex = 0;
        }
        break;
      case 'status':
        if (pattern.test(status)) {
          results.push({ filePath, fileName, snippet: `状态: ${status}`, matchType: 'status' });
        }
        pattern.lastIndex = 0;
        break;
      case 'content':
      default:
        results.push(...searchInContent(filePath, pattern));
        break;
    }
  }

  return results.slice(0, 200);
}
