import type { PublicProvider } from '../utils/portal';

export function ProviderNotice({ name, notice, provider, links = false }: { name?: string; notice?: string; provider?: PublicProvider; links?: boolean }) {
  const displayName = provider?.name || name;
  if (!displayName) return null;
  return <div className="provider-notice" role="note" aria-label="Veranstalter und Portalbetreiber">
    <p>{notice || `Anbieter dieser Freizeit ist ${displayName}. Der Jugendring Westsachsen betreibt das Vermittlungsportal.`}</p>
    {links && provider && <ProviderContact provider={provider} />}
  </div>;
}

export function ProviderContact({ provider }: { provider: PublicProvider }) {
  return <>
      <p className="preserve-lines">{provider.contact_info}</p>
      {provider.public_email && <p><a href={`mailto:${provider.public_email}`}>{provider.public_email}</a></p>}
      {provider.website && <p><a href={provider.website} target="_blank" rel="noreferrer">Website des Anbieters</a></p>}
      {provider.links?.map((link, index) => <p key={index}><a href={link.url} target="_blank" rel="noreferrer">{link.label}</a></p>)}
    </>;
}
