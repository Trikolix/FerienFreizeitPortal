import { useEffect, useRef } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const modules = { toolbar: [[{ header: [1, 2, 3, false] }], ['bold', 'italic', 'underline', 'strike'], [{ list: 'ordered' }, { list: 'bullet' }], ['blockquote', 'code-block', 'link'], ['clean']] };

export function RichTextEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<{ getEditor: () => { root: HTMLElement } }>(null);
  useEffect(() => {
    const editor = ref.current?.getEditor().root;
    editor?.setAttribute('aria-label', 'Beschreibung');
    editor?.setAttribute('role', 'textbox');
    editor?.setAttribute('aria-multiline', 'true');
  }, []);
  return <ReactQuill ref={ref} theme="snow" modules={modules} value={value} onChange={onChange} />;
}
