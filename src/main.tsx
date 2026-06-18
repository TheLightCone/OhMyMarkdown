import ReactDOM from 'react-dom/client';
import App from './App';
import { injectVditorIcons } from './utils/vditorIcons';
import { installGlobalEditorRuntime, installOutlineSyncRuntime } from './utils/editorRuntime';
import './styles/global.css';
import './styles/themes.css';
import './styles/editor-extensions.css';
import 'vditor/dist/index.css';

injectVditorIcons();
installGlobalEditorRuntime();
installOutlineSyncRuntime();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);
