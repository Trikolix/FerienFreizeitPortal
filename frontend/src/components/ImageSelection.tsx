import { useState } from 'react';
import { ImageDescriptionFields } from './ImageDescriptionFields';
import { describeFile, fileDescription } from '../utils/imageMetadata';
import { useImagePreviews } from '../utils/useImagePreviews';

export function ImageSelection({ files, onChange, existingCount = 0 }: { files: File[]; onChange: (files: File[]) => void; existingCount?: number }) {
  const [errors, setErrors] = useState<string[]>([]);
  const previews = useImagePreviews(files);
  return <div className="field field-wide file-field">
    <label>Bilder hinzufügen
      <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => {
        const incoming = Array.from(event.target.files || []);
        const invalid = incoming.filter((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024);
        if (existingCount + files.length + incoming.length > 10) setErrors(['Pro Freizeit sind höchstens 10 Bilder erlaubt.']);
        else if ([...files, ...incoming].reduce((sum, file) => sum + file.size, 0) > 25 * 1024 * 1024) setErrors(['Bitte höchstens 25 MB auf einmal auswählen.']);
        else if (invalid.length) setErrors(invalid.map((file) => `${file.name}: Bitte JPEG, PNG oder WebP mit höchstens 5 MB wählen.`));
        else { setErrors([]); onChange([...files, ...incoming]); }
        event.target.value = '';
      }} />
    </label>
    <small>JPEG, PNG oder WebP · bis 5 MB je Bild · 10 Bilder pro Freizeit · bis 6000 Pixel je Seite / 20 Megapixel. Orts- und Kameradaten werden beim Upload entfernt.</small>
    {errors.length > 0 && <p role="alert" className="alert">{errors.join(' ')}</p>}
    <ul className="image-management-list">{files.map((file, index) => <li key={`${file.name}-${index}`}>
      <img src={previews[index]} alt={`Vorschau: ${file.name}`} />
      <span>{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
      <ImageDescriptionFields label={`Bildbeschreibung für ${file.name}`} value={fileDescription(file)} onChange={value => { describeFile(file, value); onChange([...files]); }} />
      <button type="button" className="secondary-action" onClick={() => onChange(files.filter((_, i) => i !== index))}>Auswahl entfernen</button>
    </li>)}</ul>
  </div>;
}
