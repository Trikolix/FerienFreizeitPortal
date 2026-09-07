import { apiFetch } from './api';

export interface ImageMetadata {
  id: number;
  image_url: string;
  alt_text: string | null;
  is_decorative: boolean;
}
export type ImageDescription = Pick<ImageMetadata, 'alt_text' | 'is_decorative'>;
const descriptions = new WeakMap<File, ImageDescription>();
export const fileDescription = (file: File): ImageDescription => descriptions.get(file) ?? { alt_text: null, is_decorative: false };
export const describeFile = (file: File, description: ImageDescription) => descriptions.set(file, description);
export const descriptionsComplete = (images: ImageDescription[]) => images.every(image => image.is_decorative || Boolean(image.alt_text?.trim()));
export function appendImages(data: FormData, files: File[]) {
  files.forEach(file => data.append('images[]', file));
  data.append('upload_metadata', JSON.stringify(files.map(fileDescription)));
}
export async function saveImageDescriptions(campId: number, images: ImageMetadata[] = []) {
  for (const image of images) {
    await apiFetch(`/api/camps/${campId}/images/${image.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alt_text: image.alt_text, is_decorative: image.is_decorative }),
    });
  }
}
