import { Link } from 'react-router-dom';
import {
  Card,
  LinkButton,
  PageHeader,
  Badge,
  SkeletonNote,
  Button,
  Input,
  TextArea,
  ActionStatus,
  Checkbox,
} from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { Pipeline } from '../components/Pipeline';
import { DEMO_MODE } from '../config/runtime';
import { useAction } from '../lib/useAction';
import { FeatureUnavailableError } from '../lib/errors';
import { useState } from 'react';
import { useReferral } from '../providers/ReferralProvider';
const features: { title: string; description: string; icon: IconName; to: string; action: string }[] = [
  {
    title: 'Start with an experience',
    description:
      'A welcoming place to discover something useful, try it for yourself, and decide what comes next.',
    icon: 'experience',
    to: '/experience',
    action: 'Explore the experience',
  },
  {
    title: 'Build a lasting connection',
    description:
      'Bring participants, useful follow-ups, and thoughtful feedback into one organization workspace.',
    icon: 'people',
    to: '/organizations/new',
    action: 'For organizations',
  },
  {
    title: 'Let good experiences grow',
    description: 'Connect the next introduction to the experience and organization that made it possible.',
    icon: 'share',
    to: '/how-it-works',
    action: 'See the full journey',
  },
];
export function HomePage() {
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">A home for meaningful experiences</p>
          <h1>
            Every experience.
            <br />A new beginning.
          </h1>
          <p className="lede">
            Discover, participate, and stay connected. Nurture brings useful experiences and the people behind
            them into one thoughtful hub.
          </p>
          <div className="actions">
            <LinkButton to="/experience">
              Explore an experience <Icon name="arrow" />
            </LinkButton>
            <LinkButton variant="secondary" to="/how-it-works">
              How Nurture works
            </LinkButton>
          </div>
          <p className="hero-note">
            <Icon name="check" size={15} />
            Start exploring. Create an account when you’re ready.
          </p>
        </div>
        <div className="experience-preview" aria-label="Illustrative Nurture experience preview">
          <div className="preview-bar">
            <span className="preview-dot" />
            <span className="preview-dot" />
            <span className="preview-dot" />
            <small>YOUR NURTURE</small>
          </div>
          <div className="preview-content">
            <p className="eyebrow">A little space to grow</p>
            <h2>What will you explore today?</h2>
            <p className="muted">One place for your next useful experience.</p>
            <div className="preview-module">
              <Icon name="leaf" size={36} />
              <div>
                <h3>Your first experience</h3>
                <p>A welcoming introduction, at your pace.</p>
              </div>
            </div>
            <div className="row">
              <Badge tone="positive">Open to explore</Badge>
              <Icon name="arrow" />
            </div>
            <div className="preview-progress">
              <span />
              <span />
              <span />
              <span />
            </div>
            <small>Explore → Connect → Continue</small>
          </div>
        </div>
      </section>
      <div className="marketing-strip">
        <span>
          <Icon name="experience" /> <strong>Experiences</strong> worth starting
        </span>
        <span>
          <Icon name="people" /> <strong>Connections</strong> worth keeping
        </span>
        <span>
          <Icon name="share" /> <strong>Growth</strong> worth sharing
        </span>
      </div>
      <section className="section">
        <div className="section-heading">
          <h2>More than a place to begin.</h2>
          <Link to="/features">Explore Nurture</Link>
        </div>
        <div className="grid three">
          {features.map((feature) => (
            <Card className="feature-card" key={feature.title}>
              <div className="feature-icon">
                <Icon name={feature.icon} />
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              <Link to={feature.to}>
                {feature.action}
                <Icon name="arrow" size={16} />
              </Link>
            </Card>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-heading">
          <h2>A journey that keeps going.</h2>
          <Badge>Seven connected stages</Badge>
        </div>
        <Pipeline />
      </section>
      <section className="section cta-panel">
        <div>
          <p className="eyebrow">Nurture for organizations</p>
          <h2>The experience is only the beginning.</h2>
          <p>
            Give your participants a clear next step. Keep the relationship personal, learn from feedback, and
            welcome the next introduction.
          </p>
        </div>
        <LinkButton to={DEMO_MODE ? '/demo' : '/organizations/new'}>
          {DEMO_MODE ? 'Explore the demo workspace' : 'Start your organization'}
          <Icon name="arrow" />
        </LinkButton>
      </section>
    </>
  );
}
export function FeaturesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Built around the relationship"
        title="One hub. Room for what comes next."
        description="Nurture connects the public introduction, the app experience, and the ongoing customer relationship."
      />
      <div className="grid three">
        {features.map((feature) => (
          <Card key={feature.title} className="feature-card">
            <div className="feature-icon">
              <Icon name={feature.icon} />
            </div>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
            <Link to={feature.to}>{feature.action} →</Link>
          </Card>
        ))}
      </div>
      <section className="section grid two">
        <Card>
          <h2>A flexible app experience</h2>
          <p className="muted">
            The primary and secondary experience containers make space for future apps, resources, and guided
            programs. An experience can begin publicly and continue in a personal account.
          </p>
          <LinkButton variant="secondary" to="/experience">
            Try the public container
          </LinkButton>
        </Card>
        <Card>
          <h2>An organization workspace</h2>
          <p className="muted">
            Contacts are distinct from account holders. Members manage permitted parts of the lifecycle,
            including follow-up sequences, message templates, surveys, and referrals.
          </p>
          <LinkButton variant="secondary" to={DEMO_MODE ? '/demo' : '/organizations/new'}>
            Explore organization tools
          </LinkButton>
        </Card>
      </section>
    </>
  );
}
export function HowItWorksPage() {
  return (
    <>
      <PageHeader
        eyebrow="The seven-stage customer pipeline"
        title="A continuous journey, not a finish line."
        description="A good experience can lead to another visit, useful feedback, or an introduction to someone new."
      />
      <Pipeline />
      <div className="grid two section">
        <Card>
          <Badge>Public / acquisition</Badge>
          <h2 className="section">Begin with value</h2>
          <p className="muted">
            Discover Nurture, explore an offer, and try an open experience. Registration is available when you
            need to save your progress or connect with an organization.
          </p>
          <LinkButton to="/experience">Start exploring</LinkButton>
        </Card>
        <Card>
          <Badge tone="positive">Customer / app lifecycle</Badge>
          <h2 className="section">Build on the connection</h2>
          <p className="muted">
            Continue to a secondary experience, consider a relevant offer, and share feedback. Referral links
            return to the public introduction with attribution preserved.
          </p>
          <LinkButton variant="secondary" to="/register">
            Create your account
          </LinkButton>
        </Card>
      </div>
    </>
  );
}
export function AboutPage() {
  return (
    <div className="prose">
      <PageHeader
        eyebrow="About Nurture"
        title="A thoughtful home for what comes next."
        description="Nurture is a general-purpose app hub for organizations and the people who participate in their experiences."
      />
      <Card>
        <h2>Designed around a continuing relationship</h2>
        <p>
          The app framework brings discovery, participation, follow-up, and referrals together without
          prescribing what the underlying experience must be.
        </p>
        <p>
          Organizations get a place to understand their participants. Individuals get a clear place to return,
          continue, and stay in control of their preferences.
        </p>
        <LinkButton to="/how-it-works">Explore the customer journey</LinkButton>
      </Card>
    </div>
  );
}
export function HelpPage() {
  return (
    <>
      <PageHeader
        eyebrow="Help & guidance"
        title="A clear next step."
        description="Answers to the questions you might have while exploring Nurture."
      />
      <Card className="faq">
        {[
          [
            'Can I explore without an account?',
            'Yes. The public experience container is open. Account creation is offered when an experience needs saved progress, membership, or access to private content.',
          ],
          [
            'What is an organization?',
            'An organization is a workspace with its own members, permissions, contacts, and experiences. Membership must be granted through a trusted organization workflow.',
          ],
          [
            'Is an experience contact an app user?',
            'No. A contact is an organization relationship record. It does not create a login, membership, or permission to use the app.',
          ],
          [
            'Will the demo send messages or charge me?',
            'No. The demo uses fictional data in memory. Messages, schedules, checkout, and rewards are not connected to live integrations.',
          ],
          [
            'How do I change my communication preferences?',
            'Use Settings in your personal app. Organization contact consent is recorded separately by channel and purpose. Changes in this skeleton do not trigger external campaigns.',
          ],
        ].map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </Card>
      <div className="section actions">
        <LinkButton to="/contact">Contact Nurture</LinkButton>
        <LinkButton variant="secondary" to="/login">
          Account help
        </LinkButton>
      </div>
    </>
  );
}
export function ContactPage() {
  const action = useAction();
  return (
    <div className="form-narrow">
      <PageHeader
        title="Let’s find the right next step."
        eyebrow="Contact Nurture"
        description="Ask a product question or tell us about the experience you have in mind."
      />
      <SkeletonNote>
        This contact form is a skeleton preview. Delivery is not connected; no inquiry will be sent.
      </SkeletonNote>
      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              throw new FeatureUnavailableError('Contact form delivery');
            });
          }}
        >
          <Input label="Your name" name="name" autoComplete="name" required maxLength={100} />
          <Input label="Email" name="email" type="email" autoComplete="email" required />
          <TextArea label="How can we help?" name="message" required maxLength={4000} />
          <Button type="submit" disabled={action.working}>
            Preview inquiry submission
          </Button>
          <ActionStatus {...action} />
        </form>
      </Card>
    </div>
  );
}
export function TrustPage({ kind }: { kind: 'privacy' | 'terms' | 'accessibility' }) {
  const content = {
    privacy: {
      title: 'Privacy',
      intro: 'Your information deserves a clear purpose.',
      sections: [
        [
          'Privacy notice in preparation',
          'This page reserves the location for the reviewed Nurture privacy notice. It is not a completed legal policy. Production collection, retention, processors, and data rights must be documented before launch.',
        ],
        [
          'Your controls',
          'The skeleton includes account preferences, optional feedback metadata, and organization-specific contact consent. Demo data is fictional and is not written to Firebase.',
        ],
      ],
    },
    terms: {
      title: 'Terms of use',
      intro: 'Clear expectations for everyone.',
      sections: [
        [
          'Terms in preparation',
          'The reviewed terms of use will appear here before commercial launch. Pricing, subscriptions, cancellation, acceptable use, and organization responsibilities require approval. This placeholder is not a contract.',
        ],
        [
          'No live transactions',
          'Payments, message delivery, referral payouts, and production scheduling are deliberately not enabled in this skeleton.',
        ],
      ],
    },
    accessibility: {
      title: 'Accessibility',
      intro: 'A considered experience on every screen.',
      sections: [
        [
          'Designed for more ways to use Nurture',
          'The interface uses semantic navigation, labeled inputs, visible keyboard focus, touch-friendly controls, and responsive layouts. Theme preferences include light, dark, and system appearance.',
        ],
        [
          'Ongoing verification',
          'Accessibility testing and assistive-technology review remain part of feature delivery. This page does not claim formal conformance certification. Please use the contact page to review the planned feedback workflow.',
        ],
      ],
    },
  }[kind];
  return (
    <div className="prose">
      <PageHeader title={content.title} description={content.intro} eyebrow="Trust & transparency" />
      <Card>
        {content.sections.map(([title, text]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
        <div className="actions">
          <LinkButton variant="secondary" to="/preferences">
            Privacy preferences
          </LinkButton>
          <LinkButton variant="quiet" to="/contact">
            Contact
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}
export function PublicPreferencesPage() {
  const referral = useReferral();
  const [saved, setSaved] = useState(false);
  return (
    <div className="form-narrow">
      <PageHeader
        title="Your privacy preferences"
        description="Essential state keeps sign-in and the referral journey working. Advertising and optional analytics are not installed in this skeleton."
      />
      <Card>
        <Checkbox label="Essential application state" checked disabled />
        <Checkbox label="Optional analytics — not installed" checked={false} disabled />
        <Checkbox label="Advertising — not installed" checked={false} disabled />
        <p className="muted">
          Referral codes are stored in this browser session for up to 30 days. They do not contain an email
          address or grant a reward.
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            referral.clear();
            setSaved(true);
          }}
        >
          Clear stored referral attribution
        </Button>
        {saved && (
          <p role="status" className="notice success">
            The stored referral attribution has been cleared.
          </p>
        )}
      </Card>
    </div>
  );
}
