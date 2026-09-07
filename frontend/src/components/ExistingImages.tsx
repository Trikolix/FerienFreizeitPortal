import { ImageDescriptionFields } from './ImageDescriptionFields';
import type { ImageMetadata } from '../utils/imageMetadata';

export function ExistingImages({ images, onChange, onDelete }: { images: ImageMetadata[]; onChange: (images: ImageMetadata[]) => void; onDelete: (url: string) => void }) {
  return <div className="field-wide" tabIndex={-1} data-field="images">
    {images.length > 0 && <ul className="image-management-list">{images.map((image, index) => <li className="image-description-row" key={image.id}>
      <img src={image.image_url} alt="" />
      <span>Bild {index + 1}</span>
      <button className="danger-action" type="button" aria-label={`Bild ${index + 1} löschen`} onClick={() => { if (window.confirm('Dieses Bild sofort löschen? Andere ungespeicherte Änderungen bleiben erhalten.')) onDelete(image.image_url); }}>Bild löschen</button>
      <ImageDescriptionFields label={`Bildbeschreibung ${index + 1}`} value={image} onChange={value => onChange(images.map(item => item.id === image.id ? { ...item, ...value } : item))} />
    </li>)}</ul>}
  </div>;
}
