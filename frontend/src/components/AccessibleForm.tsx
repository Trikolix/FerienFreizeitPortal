import { useEffect, useId, useRef, useState } from 'react';
import type { ComponentProps, FormEvent } from 'react';

// Native constraints remain authoritative. Their messages are also linked to fields
// in a visible summary, rather than relying on transient browser tooltips.
export function AccessibleForm({ children, onInvalid, onSubmitCapture, ...props }: ComponentProps<'form'>) {
  const prefix = useId();
  const form = useRef<HTMLFormElement>(null);
  const nextFieldId = useRef(0);
  useEffect(() => {
    const markRequired = () => form.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach(field => {
      const label = field.labels?.[0];
      if (!field.required) { label?.querySelector('.required-marker')?.remove(); return; }
      if (!label || label.querySelector('.required-marker')) return;
      const marker = document.createElement('small');
      marker.className = 'required-marker';
      marker.setAttribute('aria-hidden', 'true');
      marker.textContent = ' (erforderlich)';
      (label.querySelector('span') || label).append(marker);
    });
    markRequired();
    const observer = new MutationObserver(markRequired);
    if (form.current) observer.observe(form.current, { childList: true, subtree: true, attributes: true, attributeFilter: ['required'] });
    return () => observer.disconnect();
  }, []);
  const [errors, setErrors] = useState<{ target: HTMLElement; label: string; message: string }[]>([]);
  const invalid = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearErrors();
    const fields = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input:invalid, textarea:invalid, select:invalid'));
    const issues = fields.map((field, index) => {
      if (!field.id) field.id = `${prefix}-field-${nextFieldId.current++}`;
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', [...new Set([...(field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean), `${prefix}-error-${index}`])].join(' '));
      return { target: field, label: field.labels?.[0]?.textContent?.trim() || field.getAttribute('aria-label') || 'Angabe', message: field.validity.valueMissing ? 'Bitte diese Angabe ergänzen.' : field.validity.typeMismatch ? 'Bitte das erwartete Format verwenden.' : 'Bitte den erlaubten Wertebereich und das Format prüfen.' };
    });
    setErrors(issues);
    requestAnimationFrame(() => issues[0]?.target.focus());
    onInvalid?.(event);
  };
  const clearErrors = () => {
    errors.forEach(({ target }, index) => {
      target.removeAttribute('aria-invalid');
      const ids = (target.getAttribute('aria-describedby') || '').split(' ').filter(id => id !== `${prefix}-error-${index}`);
      if (ids.length) target.setAttribute('aria-describedby', ids.join(' ')); else target.removeAttribute('aria-describedby');
    });
    setErrors([]);
  };
  return <form {...props} ref={form} onInvalid={invalid} onSubmitCapture={event => { clearErrors(); onSubmitCapture?.(event); }}>
    <p className="form-required-hint">Pflichtfelder sind mit „erforderlich“ gekennzeichnet.</p>
    {errors.length > 0 && <div className="validation-summary" role="alert"><p>Bitte prüfe die folgenden Angaben:</p><ul>{errors.map((error, index) => <li key={index} id={`${prefix}-error-${index}`}><button type="button" onClick={() => error.target.focus()}>{error.label}: {error.message}</button></li>)}</ul></div>}
    {children}
  </form>;
}
