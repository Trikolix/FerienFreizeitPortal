import { useEffect, useId, useRef, useState } from 'react';
import ReactQuill from 'react-quill-new';
import type Quill from 'quill';
import type { Range } from 'quill';
import { Modal } from './Modal';
import 'react-quill-new/dist/quill.snow.css';

const modules = { toolbar: false };
export function RichTextEditor({ value, onChange, errorId }: { value: string; onChange: (value: string) => void; errorId?: string }) {
  const ref = useRef<{ getEditor: () => Quill }>(null);
  const id = useId();
  const [formats, setFormats] = useState<Record<string, unknown>>({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const selection = useRef({ index: 0, length: 0 });
  useEffect(() => {
    const editor = ref.current?.getEditor().root;
    editor?.setAttribute('aria-label', 'Beschreibung');
    editor?.setAttribute('role', 'textbox');
    editor?.setAttribute('aria-multiline', 'true');
    editor?.setAttribute('aria-describedby', [id + '-help', errorId].filter(Boolean).join(' '));
    editor?.setAttribute('aria-invalid', String(Boolean(errorId)));
  }, [id, errorId]);
  const updateFormats = () => { const editor = ref.current?.getEditor(); if (editor) setFormats(editor.getFormat()); };
  const format = (name: string, val: unknown) => { const editor = ref.current?.getEditor(); editor?.focus(); editor?.format(name, val); updateFormats(); };
  const openLink = () => {
    const editor = ref.current?.getEditor();
    if (!editor) return;
    selection.current = editor.getSelection(true) || { index: 0, length: 0 };
    setUrl(String(editor.getFormat().link || ''));
    setLinkError(''); setLinkOpen(true);
  };
  return <div className="rich-editor" onKeyDownCapture={event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !linkOpen) { event.preventDefault(); event.stopPropagation(); openLink(); }
  }}>
    <div className="rich-toolbar" role="group" aria-label="Beschreibung formatieren">
      <label className="sr-only" htmlFor={id}>Absatzformat</label>
      <select id={id} value={Number(formats.header) || 0} onChange={event => format('header', Number(event.target.value) || false)}>
        <option value={0}>Absatz</option><option value={2}>Überschrift</option><option value={3}>Unterüberschrift</option>
      </select>
      {([['bold', 'Fett'], ['italic', 'Kursiv'], ['underline', 'Unterstrichen'], ['strike', 'Durchgestrichen']] as const).map(([name, label]) =>
        <button key={name} type="button" aria-pressed={Boolean(formats[name])} onMouseDown={event => event.preventDefault()} onClick={() => format(name, !formats[name])}>{label}</button>)}
      <button type="button" aria-pressed={formats.list === 'bullet'} onMouseDown={event => event.preventDefault()} onClick={() => format('list', formats.list === 'bullet' ? false : 'bullet')}>Aufzählung</button>
      <button type="button" aria-pressed={formats.list === 'ordered'} onMouseDown={event => event.preventDefault()} onClick={() => format('list', formats.list === 'ordered' ? false : 'ordered')}>Nummerierung</button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={openLink}>Link bearbeiten</button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { const editor = ref.current?.getEditor(); const range = editor?.getSelection(true); if (range) editor?.removeFormat(range.index, range.length); updateFormats(); }}>Formatierung entfernen</button>
    </div>
    <ReactQuill ref={ref} theme="snow" modules={modules} value={value} onChange={(html: string) => { onChange(html); updateFormats(); }} onChangeSelection={(range: Range | null) => { if (range) { selection.current = range; updateFormats(); } }} />
    <p id={id + '-help'} className="editor-help">Beschreibe die Freizeit in kurzen Absätzen. Markiere Text, um ihn zu formatieren oder einen Link einzufügen.</p>
    {linkOpen && <Modal title="Link bearbeiten" onClose={() => setLinkOpen(false)}>
      <h2>Link bearbeiten</h2>
      <label className="field">Linkadresse<input type="text" inputMode="url" autoFocus value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…" aria-invalid={Boolean(linkError)} aria-describedby={linkError ? id + '-error' : undefined} /></label>
      {linkError && <p id={id + '-error'} role="alert">{linkError}</p>}
      <div className="form-actions"><button type="button" className="primary-action" onClick={() => {
        if (url && !/^(https?:\/\/|mailto:|tel:)/i.test(url.trim())) { setLinkError('Bitte eine Adresse mit https://, http://, mailto: oder tel: eingeben.'); return; }
        const editor = ref.current?.getEditor();
        const range = selection.current;
        if (range.length) editor?.formatText(range.index, range.length, 'link', url.trim() || false);
        else if (url.trim()) editor?.insertText(range.index, url.trim(), 'link', url.trim());
        setLinkOpen(false);
      }}>Übernehmen</button><button type="button" className="secondary-action" onClick={() => setLinkOpen(false)}>Abbrechen</button></div>
    </Modal>}
  </div>;
}
