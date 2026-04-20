import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — NM Media",
  description: "Privacy Policy for NM Media marketing analytics platform.",
};

/**
 * Public privacy policy page — required by Meta App review and other OAuth providers.
 * This page does not require authentication and must remain publicly accessible.
 */
export default function PrivacyPolicyPage(): React.ReactElement {
  const lastUpdated = "20 April 2026";
  const contactEmail = "support@topasiaedu.com";
  const companyName = "NM Media";
  const appName = "NM Media Analytics Platform";

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-semibold text-slate-900 text-sm">{companyName}</span>
          <span className="text-xs text-slate-400">Privacy Policy</span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: {lastUpdated}</p>

        {/* Introduction */}
        <Section title="1. Introduction">
          <p>
            {companyName} (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) operates the{" "}
            <strong>{appName}</strong> (the &ldquo;Platform&rdquo;). This Privacy Policy explains how we
            collect, use, store, and protect information when you or your organisation uses our Platform,
            including when we access third-party services such as Meta (Facebook), GoHighLevel, and Zoom
            on your behalf.
          </p>
          <p className="mt-3">
            By using the Platform you agree to the practices described in this policy. If you do not
            agree, please discontinue use immediately.
          </p>
        </Section>

        {/* Who we are */}
        <Section title="2. Who We Are">
          <p>
            The Platform is an internal business-intelligence tool used by {companyName} and its
            authorised partner agencies to track webinar attendance, lead generation, and advertising
            performance. Access is restricted to authenticated employees and approved agency partners.
            The Platform is <strong>not open to the general public</strong>.
          </p>
        </Section>

        {/* Data we collect */}
        <Section title="3. Data We Collect">
          <p className="mb-3">
            We collect and process data through the following channels:
          </p>
          <SubSection heading="3.1 Meta Ads (Facebook Marketing API)">
            <p>
              When an authorised user connects a Meta Business ad account via OAuth, we access and
              store:
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Ad account identifiers, names, and currency settings</li>
              <li>Campaign names, objectives, and statuses</li>
              <li>Daily aggregated performance insights (impressions, clicks, spend, reach)</li>
              <li>A long-lived access token (encrypted at rest) used to refresh data automatically</li>
            </ul>
            <p className="mt-2">
              We do <strong>not</strong> access personal Facebook user profiles, friends lists,
              messages, or any data outside the advertising account you explicitly authorise.
            </p>
          </SubSection>
          <SubSection heading="3.2 GoHighLevel (GHL)">
            <p>
              Through private integration tokens provided by each agency, we mirror the following CRM
              data into our database for analytics:
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Contact records (name, email, phone, tags, custom fields)</li>
              <li>Order and invoice records</li>
              <li>Location / sub-account metadata</li>
            </ul>
          </SubSection>
          <SubSection heading="3.3 Zoom">
            <p>
              Via Server-to-Server OAuth credentials provided by each agency, we retrieve:
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Webinar and meeting participant reports (display name, email, join/leave times, duration)</li>
              <li>Meeting and webinar metadata (topic, start time, duration)</li>
            </ul>
          </SubSection>
          <SubSection heading="3.4 Platform Usage Data">
            <p>
              Standard server and application logs may record IP addresses, browser user-agent strings,
              and request timestamps for security and debugging purposes. These logs are retained for up
              to 30 days.
            </p>
          </SubSection>
        </Section>

        {/* How we use data */}
        <Section title="4. How We Use Your Data">
          <p>We use the data described above solely for the following purposes:</p>
          <ul className="list-disc ml-5 mt-3 space-y-1">
            <li>Displaying advertising performance dashboards (cost per lead, cost per acquisition)</li>
            <li>Tracking webinar attendance and audience engagement</li>
            <li>Attributing ad spend to specific sales events and revenue</li>
            <li>Generating internal reports for authorised {companyName} staff and agency partners</li>
            <li>Maintaining the integrity and security of the Platform</li>
          </ul>
          <p className="mt-3">
            We do <strong>not</strong> sell, rent, or trade your data to any third party. We do not use
            it for advertising targeting, profiling, or any purpose other than those listed above.
          </p>
        </Section>

        {/* Data storage and security */}
        <Section title="5. Data Storage and Security">
          <p>
            All data is stored in a Supabase (PostgreSQL) database hosted on secure cloud infrastructure
            with the following protections:
          </p>
          <ul className="list-disc ml-5 mt-3 space-y-1">
            <li>All data is encrypted in transit using TLS 1.2 or higher</li>
            <li>Sensitive credentials (API tokens, client secrets) are encrypted at rest using AES-256</li>
            <li>Row-Level Security (RLS) policies restrict data access to the workspace it belongs to</li>
            <li>Access tokens obtained via OAuth (Meta, Zoom) are stored encrypted and never exposed in API responses</li>
            <li>The Platform is deployed on Vercel with infrastructure provided by industry-standard cloud providers</li>
          </ul>
        </Section>

        {/* Data retention */}
        <Section title="6. Data Retention">
          <p>
            Data is retained for as long as your organisation uses the Platform and the relevant
            integration remains active:
          </p>
          <ul className="list-disc ml-5 mt-3 space-y-1">
            <li>
              <strong>Meta Ads data</strong> — retained indefinitely for historical trend analysis.
              Removed upon your request or when you revoke the Meta OAuth connection.
            </li>
            <li>
              <strong>CRM and Zoom data</strong> — retained while the integration credential is active.
              Removed upon your request or when the credential is deleted.
            </li>
            <li>
              <strong>Server logs</strong> — retained for up to 30 days then automatically purged.
            </li>
          </ul>
          <p className="mt-3">
            You may request deletion of your data at any time by contacting us at{" "}
            <a href={`mailto:${contactEmail}`} className="text-indigo-600 hover:underline">
              {contactEmail}
            </a>{"."}
          </p>
        </Section>

        {/* Third-party services */}
        <Section title="7. Third-Party Services">
          <p>
            The Platform integrates with the following third-party services. Each service is governed by
            its own privacy policy:
          </p>
          <ul className="list-disc ml-5 mt-3 space-y-1">
            <li>
              <strong>Meta (Facebook)</strong> —{" "}
              <a
                href="https://www.facebook.com/privacy/policy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                facebook.com/privacy/policy
              </a>
            </li>
            <li>
              <strong>GoHighLevel</strong> —{" "}
              <a
                href="https://www.gohighlevel.com/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                gohighlevel.com/privacy-policy
              </a>
            </li>
            <li>
              <strong>Zoom</strong> —{" "}
              <a
                href="https://explore.zoom.us/en/privacy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                explore.zoom.us/en/privacy
              </a>
            </li>
            <li>
              <strong>Supabase</strong> —{" "}
              <a
                href="https://supabase.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                supabase.com/privacy
              </a>
            </li>
            <li>
              <strong>Vercel</strong> —{" "}
              <a
                href="https://vercel.com/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                vercel.com/legal/privacy-policy
              </a>
            </li>
          </ul>
        </Section>

        {/* Cookies */}
        <Section title="8. Cookies and Local Storage">
          <p>
            The Platform uses browser local storage (not cookies) to persist the authenticated session
            token and selected workspace/project preferences. No tracking cookies or advertising pixels
            are used. No data from local storage is shared with third parties.
          </p>
        </Section>

        {/* User rights */}
        <Section title="9. Your Rights">
          <p>
            Authorised users and the organisations they represent have the right to:
          </p>
          <ul className="list-disc ml-5 mt-3 space-y-1">
            <li>Request a copy of all data held about their organisation</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of their data</li>
            <li>Revoke any third-party OAuth connection at any time through the Platform settings or the third-party provider&apos;s own settings</li>
          </ul>
          <p className="mt-3">
            To exercise any of these rights, contact us at{" "}
            <a href={`mailto:${contactEmail}`} className="text-indigo-600 hover:underline">
              {contactEmail}
            </a>{"."}
          </p>
        </Section>

        {/* Children */}
        <Section title="10. Children's Privacy">
          <p>
            The Platform is intended for use by business professionals only. We do not knowingly collect
            or process data relating to individuals under the age of 18.
          </p>
        </Section>

        {/* Changes */}
        <Section title="11. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. When we do, we will revise the
            &ldquo;Last updated&rdquo; date at the top of this page. Continued use of the Platform after
            changes are published constitutes acceptance of the updated policy.
          </p>
        </Section>

        {/* Contact */}
        <Section title="12. Contact Us">
          <p>
            If you have any questions about this Privacy Policy or how we handle your data, please
            contact:
          </p>
          <address className="mt-3 not-italic text-slate-700 space-y-1">
            <p className="font-semibold">{companyName}</p>
            <p>
              Email:{" "}
              <a href={`mailto:${contactEmail}`} className="text-indigo-600 hover:underline">
                {contactEmail}
              </a>
            </p>
          </address>
        </Section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 mt-16">
        <div className="max-w-3xl mx-auto px-6 py-6 text-xs text-slate-400 flex items-center justify-between">
          <span>&copy; {new Date().getFullYear()} {companyName}. All rights reserved.</span>
          <span>Last updated {lastUpdated}</span>
        </div>
      </footer>
    </div>
  );
}

/** Renders a numbered section with a heading and body content. */
function Section({
  title,
  children,
}: Readonly<{
  title: string;
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-slate-900 mb-3 pb-2 border-b border-slate-100">
        {title}
      </h2>
      <div className="text-sm text-slate-700 leading-relaxed">{children}</div>
    </section>
  );
}

/** Renders a sub-section with a bold heading inside a Section. */
function SubSection({
  heading,
  children,
}: Readonly<{
  heading: string;
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-slate-800 mb-1">{heading}</h3>
      <div className="text-sm text-slate-700 leading-relaxed">{children}</div>
    </div>
  );
}
