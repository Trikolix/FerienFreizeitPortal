import React from 'react';

export const Impressum: React.FC = () => {
  return (
    <div className="imprint-page">
      <span className="eyebrow">Rechtliches</span>
      <h1>Impressum</h1>

      <h2>Angaben gemäß § 5 TMG</h2>
      <p>
        Max Mustermann<br />
        Musterstraße 1<br />
        01234 Musterstadt
      </p>

      <h2>Kontakt</h2>
      <p>
        Telefon: +49 (0) 123 44 55 66<br />
        E-Mail: kontakt@westsachsen-camps.de
      </p>

      <h2>Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV</h2>
      <p>
        Max Mustermann<br />
        Musterstraße 1<br />
        01234 Musterstadt
      </p>

      <h2>Haftungsausschluss</h2>
      <h3>Haftung für Inhalte</h3>
      <p>
        Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten nach den
        allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch
        nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen.
      </p>

      <h3>Haftung für Links</h3>
      <p>
        Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss
        haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen.
      </p>
    </div>
  );
};
