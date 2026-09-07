import { useId } from 'react';
import type { ImageDescription } from '../utils/imageMetadata';

export function ImageDescriptionFields({ value, onChange, label }: { value: ImageDescription; onChange: (value: ImageDescription) => void; label: string }) {
  const id = useId();
  return <div className="image-description-fields">
    <label className="field" htmlFor={id}>{label}
      <textarea id={id} maxLength={500} disabled={value.is_decorative} value={value.alt_text ?? ''}
        aria-describedby={`${id}-help`} onChange={event => onChange({ ...value, alt_text: event.target.value })} />
    </label>
    <p id={`${id}-help`} className="editor-help">Beschreibe kurz die wesentliche Bildinformation. Texte im Bild müssen auch als Text zugänglich sein. Höchstens 500 Zeichen.</p>
    <label className="toggle-field"><input type="checkbox" checked={value.is_decorative}
      onChange={event => onChange({ ...value, is_decorative: event.target.checked })} />
      <span>Dekoratives Bild – vermittelt keine zusätzliche Information</span></label>
    {!value.is_decorative && !value.alt_text?.trim() && <p className="editor-help">Beschreibung ausstehend. Bitte vor dem Veröffentlichen ergänzen.</p>}
  </div>;
}
