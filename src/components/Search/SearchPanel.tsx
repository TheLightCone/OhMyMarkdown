import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { SearchResult } from '../../types';
import './SearchPanel.css';

interface SearchPanelProps {
  onResultClick: (result: SearchResult) => void;
}

export default function SearchPanel({ onResultClick }: SearchPanelProps) {
  const { searchResults, setSearchResults, setShowSearch, currentFile, workspacePath } = useAppStore();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('workspace');
  const [searchType, setSearchType] = useState('content');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const results = await window.electronAPI.search.query({
        query,
        scope,
        scopePath: scope === 'current_file' ? currentFile : scope === 'current_folder' && currentFile ? currentFile : workspacePath,
        searchType,
        caseSensitive,
        wholeWord,
        useRegex,
      });
      setSearchResults(results);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-panel">
      <div className="search-header">
        <span>搜索</span>
        <button className="icon-btn" onClick={() => setShowSearch(false)}>✕</button>
      </div>

      <div className="search-form">
        <div className="search-input-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入搜索关键词..."
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            autoFocus
          />
          <button className="btn btn-primary" onClick={handleSearch} disabled={loading}>
            {loading ? '...' : '搜索'}
          </button>
        </div>

        <div className="search-options">
          <div className="form-group">
            <label>查找范围</label>
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="workspace">全局工作区</option>
              <option value="current_folder">当前文件夹</option>
              <option value="current_file">当前打开文件</option>
            </select>
          </div>
          <div className="form-group">
            <label>查找类型</label>
            <select value={searchType} onChange={(e) => setSearchType(e.target.value)}>
              <option value="content">文件内容</option>
              <option value="filename">文件名</option>
              <option value="tags">标签</option>
              <option value="status">文件状态</option>
            </select>
          </div>
          <div className="checkbox-row">
            <input type="checkbox" id="case" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
            <label htmlFor="case">区分大小写</label>
          </div>
          <div className="checkbox-row">
            <input type="checkbox" id="whole" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} />
            <label htmlFor="whole">全字匹配</label>
          </div>
          <div className="checkbox-row">
            <input type="checkbox" id="regex" checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} />
            <label htmlFor="regex">正则表达式</label>
          </div>
        </div>
      </div>

      <div className="search-results">
        <div className="search-results-header">
          结果 ({searchResults.length})
        </div>
        {searchResults.length === 0 ? (
          <div className="search-empty">{query ? '未找到匹配结果' : '输入关键词开始搜索'}</div>
        ) : (
          searchResults.map((result, i) => (
            <div key={`${result.filePath}-${result.lineNumber}-${i}`} className="search-result-item" onClick={() => onResultClick(result)}>
              <div className="result-filename">{result.fileName}</div>
              {result.lineNumber && <span className="result-line">行 {result.lineNumber}</span>}
              <div className="result-snippet">{result.snippet}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
