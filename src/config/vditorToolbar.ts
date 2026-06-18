/** Vditor 工具栏项中文提示（悬浮显示） */
const TOOLBAR_TIPS: Record<string, string> = {
  emoji: '表情',
  headings: '标题',
  bold: '粗体',
  italic: '斜体',
  strike: '删除线',
  line: '分隔线',
  quote: '引用',
  list: '无序列表',
  'ordered-list': '有序列表',
  check: '任务列表',
  code: '代码块',
  'inline-code': '行内代码',
  link: '链接',
  upload: '上传图片',
  table: '表格',
  undo: '撤销',
  redo: '重做',
  'edit-mode': '切换编辑模式',
  preview: '预览',
  fullscreen: '全屏',
};

const TOOLBAR_NAMES = [
  'emoji',
  'headings',
  'bold',
  'italic',
  'strike',
  '|',
  'line',
  'quote',
  'list',
  'ordered-list',
  'check',
  '|',
  'code',
  'inline-code',
  'link',
  'upload',
  'table',
  '|',
  'undo',
  'redo',
  '|',
  'edit-mode',
  'preview',
  'fullscreen',
] as const;

export const VDITOR_TOOLBAR = TOOLBAR_NAMES.map((name) => {
  if (name === '|') return name;
  return {
    name,
    tip: TOOLBAR_TIPS[name],
    tipPosition: 's' as const,
  };
});
