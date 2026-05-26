export const metadata = {
  title: 'Privacy Policy — Tijori',
  description: 'Privacy policy for the Tijori personal data vault app.',
};

export default function PrivacyPolicyPage() {
  const lastUpdated = 'May 26, 2025';

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px', fontFamily: 'Inter, sans-serif', color: '#1A1A2E', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ fontSize: 14, color: '#5A6178', marginBottom: 40 }}>Last updated: {lastUpdated}</p>

      <Section title="1. Who We Are">
        <p>
          Tijori ("we", "our", or "us") is a personal data vault application developed by Bewake.
          We help users securely store and control access to their personal data including identity,
          address, payment card references, and contact information.
        </p>
        <p style={{ marginTop: 12 }}>
          Contact: <a href="mailto:vivek11.11.19989@gmail.com" style={{ color: '#196699' }}>vivek11.11.19989@gmail.com</a>
        </p>
      </Section>

      <Section title="2. What Data We Collect">
        <p>We collect and store only the data you explicitly provide:</p>
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li><strong>Account data:</strong> name, email address, hashed password</li>
          <li><strong>Identity data:</strong> full name, date of birth, government ID numbers</li>
          <li><strong>Address data:</strong> home or work address details</li>
          <li><strong>Payment references:</strong> card last-4 digits, expiry, card type (we do <em>not</em> store full card numbers)</li>
          <li><strong>Contact data:</strong> phone numbers, secondary email addresses</li>
          <li><strong>Audit logs:</strong> timestamps and types of data-access events</li>
        </ul>
        <p style={{ marginTop: 12 }}>We do <strong>not</strong> collect advertising identifiers, location data, or any data beyond what you enter.</p>
      </Section>

      <Section title="3. How We Use Your Data">
        <ul style={{ paddingLeft: 20 }}>
          <li>To provide the core vault storage and retrieval service</li>
          <li>To authenticate you securely</li>
          <li>To generate audit logs of who accessed your data and when</li>
          <li>To allow you to grant and revoke third-party data access (consent management)</li>
        </ul>
        <p style={{ marginTop: 12 }}>We do <strong>not</strong> sell, rent, or share your personal data with third parties for marketing purposes.</p>
      </Section>

      <Section title="4. How We Protect Your Data">
        <ul style={{ paddingLeft: 20 }}>
          <li>All data is encrypted at rest using AES-256 field-level encryption</li>
          <li>All data in transit is protected by TLS 1.2+</li>
          <li>Passwords are hashed using bcrypt and never stored in plain text</li>
          <li>Access tokens are short-lived JWTs; refresh tokens are stored securely</li>
          <li>Secrets are managed via Azure Key Vault</li>
        </ul>
      </Section>

      <Section title="5. Data Retention">
        <p>
          Your data is retained for as long as your account is active. When you delete your account,
          all personal vault data is permanently erased within 30 days. Audit logs may be retained
          for up to 90 days for security purposes before deletion.
        </p>
      </Section>

      <Section title="6. Your Rights (GDPR / DPDPA)">
        <p>Depending on your jurisdiction, you have the right to:</p>
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li><strong>Access:</strong> download a copy of all your data (via the app's Export feature)</li>
          <li><strong>Rectification:</strong> edit any stored data directly in the app</li>
          <li><strong>Erasure:</strong> delete your account and all associated data</li>
          <li><strong>Portability:</strong> export your data in JSON format</li>
          <li><strong>Withdraw consent:</strong> revoke any third-party data access at any time</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          To exercise any of these rights, use the in-app controls or contact us at{' '}
          <a href="mailto:vivek11.11.19989@gmail.com" style={{ color: '#196699' }}>vivek11.11.19989@gmail.com</a>.
        </p>
      </Section>

      <Section title="7. Third-Party Services">
        <p>We use the following infrastructure services to operate Tijori:</p>
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li><strong>Microsoft Azure</strong> — cloud hosting and database (Azure Container Apps, PostgreSQL)</li>
          <li><strong>Azure Key Vault</strong> — secret management</li>
        </ul>
        <p style={{ marginTop: 12 }}>These providers process data only to the extent necessary to operate our service.</p>
      </Section>

      <Section title="8. Children's Privacy">
        <p>
          Tijori is not directed at children under 13. We do not knowingly collect personal data
          from children. If you believe a child has provided us with personal data, please contact
          us and we will delete it promptly.
        </p>
      </Section>

      <Section title="9. Changes to This Policy">
        <p>
          We may update this policy from time to time. We will notify you of significant changes
          via email or an in-app notice. The "last updated" date at the top of this page reflects
          the most recent revision.
        </p>
      </Section>

      <Section title="10. Contact Us">
        <p>
          For any privacy-related questions or requests, please contact:<br />
          <strong>Bewake / Tijori</strong><br />
          Email: <a href="mailto:vivek11.11.19989@gmail.com" style={{ color: '#196699' }}>vivek11.11.19989@gmail.com</a>
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, color: '#1B3A5C' }}>{title}</h2>
      {children}
    </section>
  );
}
