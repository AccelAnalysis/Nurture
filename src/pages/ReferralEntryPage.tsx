import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useReferral } from '../providers/ReferralProvider';
import { createAttribution } from '../domain/validation';
import { Badge, Card, LinkButton, PageHeader } from '../components/ui';
export function ReferralEntryPage() {
  const { referralCode = '' } = useParams();
  const [params] = useSearchParams();
  const { capture, attribution } = useReferral();
  const source = params.get('source') ?? 'referral';
  const campaign = params.get('campaign') ?? '';
  const valid = !!createAttribution(referralCode);
  useEffect(() => {
    if (valid) capture(referralCode, source, campaign);
  }, [valid, referralCode, source, campaign, capture]);
  return (
    <div className="form-narrow">
      <PageHeader
        eyebrow="A new introduction"
        title="Someone thought of you."
        description="Welcome to Nurture. Discover an experience, try it at your pace, and decide what comes next."
      />
      <Card>
        <Badge tone={valid ? 'positive' : 'warning'}>
          {valid ? 'Introduction received' : 'Unrecognized referral format'}
        </Badge>
        <h2 className="section">A good place to begin.</h2>
        <p className="muted">
          {valid
            ? 'The referral code is preserved through this browsing session and account creation. Its organization and eligibility must still be verified by the server.'
            : 'You can still explore Nurture without using this code.'}
        </p>
        {attribution && (
          <p className="muted">
            <small>First introduction saved: {attribution.referralCode} · pending verification</small>
          </p>
        )}
        <div className="actions">
          <LinkButton to="/">Discover Nurture</LinkButton>
          <LinkButton variant="secondary" to="/experience">
            Try an experience
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}
