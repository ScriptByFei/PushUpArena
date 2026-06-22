import { LegalLayout } from '@/components/layout/LegalLayout';

export default function Imprint() {
  return (
    <LegalLayout title="Impressum">
      <h2>Angaben gemäß § 5 TMG</h2>
      <p>
        [Name / Firma]
        <br />
        [Straße & Hausnummer]
        <br />
        [PLZ Ort]
        <br />
        [Land]
      </p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: [kontakt@example.com]
        <br />
        Telefon: [optional]
      </p>

      <h2>Verantwortlich für den Inhalt</h2>
      <p>[Name], [Anschrift wie oben]</p>

      <h2>Haftungsausschluss</h2>
      <p>
        Dies ist ein Platzhalter-Impressum. Ergänze die gesetzlich erforderlichen Angaben, bevor du
        die App öffentlich betreibst.
      </p>
    </LegalLayout>
  );
}
