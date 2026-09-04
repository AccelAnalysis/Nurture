import { firebaseConfigured } from "./firebase";

const stages = [
  "Marketing Page",
  "Offers",
  "Registration + Onboarding",
  "The App Experience",
  "Secondary Experience",
  "Upsells + Recurring Offer",
  "Feedback + Referral",
];

const services = [
  ["Firebase", "App platform"],
  ["Stripe", "Payments + subscriptions"],
  ["Twilio + SendGrid", "SMS + email"],
  ["GitHub", "Source + CI/CD"],
];

export default function App() {
  return (
    <div className="page-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Nurture home">
          Nurture
        </a>
        <span className={`status ${firebaseConfigured ? "ready" : "pending"}`}>
          <span aria-hidden="true" />
          {firebaseConfigured ? "Firebase connected" : "Firebase config pending"}
        </span>
      </header>

      <main id="top">
        <section className="hero">
          <p className="eyebrow">Customer lifecycle platform</p>
          <h1>One foundation for the entire customer journey.</h1>
          <p className="lede">
            Nurture connects acquisition, onboarding, the app experience,
            recurring value, feedback, and referral in one coherent platform.
          </p>
        </section>

        <section className="stage-card" aria-labelledby="pipeline-title">
          <div className="section-heading">
            <p className="eyebrow">Foundation</p>
            <h2 id="pipeline-title">Seven-Stage Customer Pipeline</h2>
          </div>
          <ol className="pipeline">
            {stages.map((stage, index) => (
              <li key={stage}>
                <span className="stage-number">{index + 1}</span>
                <span>{stage}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="stack-section" aria-labelledby="stack-title">
          <div className="section-heading">
            <p className="eyebrow">Selected stack</p>
            <h2 id="stack-title">Streamlined by design.</h2>
          </div>
          <div className="service-grid">
            {services.map(([name, role]) => (
              <article className="service-card" key={name}>
                <h3>{name}</h3>
                <p>{role}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer>
        <span>Nurture</span>
        <span>nurture.accelanalysis.com</span>
      </footer>
    </div>
  );
}
