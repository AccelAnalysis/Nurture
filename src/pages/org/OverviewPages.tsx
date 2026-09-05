import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useOrganization } from '../../providers/OrganizationProvider';
import { useAsync } from '../../lib/useAsync';
import { contactService } from '../../services/lifecycleServices';
import { DEMO_MODE } from '../../config/runtime';
import { pipelineStages } from '../../domain/lifecycle';
import { Badge, Card, LinkButton, Metric, PageHeader, EmptyState } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { Pipeline } from '../../components/Pipeline';
import { ResourceState } from '../../components/ResourceState';
export function OrganizationOverviewPage({ dashboard = false }: { dashboard?: boolean }) {
  const org = useOrganization();
  const base = `/org/${org.organization!.id}`;
  return (
    <>
      <PageHeader
        eyebrow="Organization workspace"
        title={dashboard ? 'Your customer journey, at a glance.' : 'Make every connection count.'}
        description={`${org.organization!.name} · A shared home for experiences and the relationships that follow.`}
        actions={
          <LinkButton to={`${base}/contacts/new`}>
            <Icon name="plus" />
            Add a contact
          </LinkButton>
        }
      />
      <div className="grid four">
        <Metric
          label="Experience contacts"
          value={DEMO_MODE ? '6' : '—'}
          detail={DEMO_MODE ? 'Sample relationship records' : 'Contact metrics pending'}
        />
        <Metric
          label="Experience participation"
          value={DEMO_MODE ? '38' : '—'}
          detail={DEMO_MODE ? 'Illustrative pipeline activity' : 'Event tracking pending'}
        />
        <Metric
          label="Feedback received"
          value={DEMO_MODE ? '1' : '—'}
          detail={DEMO_MODE ? 'Sample feedback record' : 'Feedback tracking pending'}
        />
        <Metric
          label="Referral introductions"
          value={DEMO_MODE ? '9' : '—'}
          detail={DEMO_MODE ? 'Illustrative pipeline activity' : 'Attribution tracking pending'}
        />
      </div>
      <section className="section">
        <div className="section-heading">
          <h2>The seven-stage lifecycle</h2>
          <Link to={`${base}/lifecycle`}>Explore lifecycle</Link>
        </div>
        <Pipeline metrics />
      </section>
      <section className="section grid two">
        <Card>
          <div className="row">
            <h2>Keep the relationship moving</h2>
            <Icon name="flow" />
          </div>
          <p className="muted">
            A thoughtful sequence connects the experience to feedback, a useful follow-up, and a new
            introduction.
          </p>
          <ul className="timeline">
            {[
              ['Day 0', 'Say thank you'],
              ['Day 2', 'Invite feedback'],
              ['Day 7', 'Share a useful next step'],
              ['Day 21', 'Introduce a relevant offer'],
              ['Day 45', 'Ask for an introduction'],
            ].map(([day, text]) => (
              <li key={day}>
                <span className="timeline-dot" />
                <div>
                  <p>{text}</p>
                  <small>From experience completion · {day}</small>
                </div>
              </li>
            ))}
          </ul>
          <div className="card-footer">
            <LinkButton variant="secondary" to={`${base}/sequences`}>
              Review contact sequences
            </LinkButton>
          </div>
        </Card>
        <div className="stack">
          <Card>
            <Badge tone="warning">Scheduling not connected</Badge>
            <h2 className="section">Build trust before sending.</h2>
            <p className="muted">
              Contact permissions, quiet hours, stop conditions, and frequency caps belong in every sequence.
              No messages are sent from this skeleton.
            </p>
            <LinkButton variant="secondary" to={`${base}/templates`}>
              Review message templates
            </LinkButton>
          </Card>
          <Card>
            <h2>Close the learning loop</h2>
            <p className="muted">
              Create a survey, review feedback, and understand where the next introduction began.
            </p>
            <div className="actions">
              <LinkButton variant="secondary" to={`${base}/surveys`}>
                Survey templates
              </LinkButton>
              <LinkButton
                variant="quiet"
                to={org.permits('organization:manage') ? `${base}/referrals` : '/app/referrals'}
              >
                Referral program
              </LinkButton>
            </div>
          </Card>
        </div>
      </section>
    </>
  );
}
export function LifecyclePage() {
  const { organization } = useOrganization();
  const id = organization!.id;
  const result = useAsync(useCallback(() => contactService.list(id), [id]));
  return (
    <>
      <PageHeader
        eyebrow="From introduction to advocacy"
        title="Customer & contact lifecycle"
        description="Pipeline position describes the relationship, not a user’s access rights. A contact may never create a Nurture account."
      />
      <Pipeline />
      <section className="section">
        <ResourceState result={result}>
          {(contacts) => (
            <div className="grid three">
              {pipelineStages.map((stage) => {
                const group = contacts.filter((contact) => contact.stage === stage.id);
                return (
                  <Card key={stage.id}>
                    <div className="row">
                      <Badge>Stage {stage.id}</Badge>
                      <small>{group.length} contacts</small>
                    </div>
                    <h2 className="section">{stage.title}</h2>
                    <p className="muted">{stage.description}</p>
                    {group.length ? (
                      group.map((contact) => (
                        <div className="list-row" key={contact.id}>
                          <Link to={`/org/${id}/contacts/${contact.id}`}>{contact.name}</Link>
                          <Badge>{contact.status}</Badge>
                        </div>
                      ))
                    ) : (
                      <small>No contacts at this stage.</small>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </ResourceState>
      </section>
    </>
  );
}
export function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Insights across the journey"
        description="Acquisition, conversion, participation, retention, feedback, and referrals will share a consistent event vocabulary."
        actions={<Badge tone="warning">Illustrative, not live analytics</Badge>}
      />
      <Pipeline metrics />
      <div className="grid two section">
        <Card>
          <h2>Participation over time</h2>
          <p className="muted">A preview of future engagement reporting.</p>
          {DEMO_MODE ? (
            <div
              className="chart-placeholder"
              role="img"
              aria-label="Illustrative weekly participation: 12, 19, 16, 28, 32, and 38. Not live analytics."
            >
              {[12, 19, 16, 28, 32, 38].map((count, index) => (
                <div className="chart-bar" key={index}>
                  <span style={{ height: `${count * 3}px` }} />
                  <small>W{index + 1}</small>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Awaiting experience events"
              description="No analytics collection or warehouse has been enabled."
              icon="chart"
            />
          )}
        </Card>
        <Card>
          <h2>Measure what matters</h2>
          <dl className="key-value">
            <dt>Acquisition</dt>
            <dd>Attributed visits</dd>
            <dt>Activation</dt>
            <dd>First experience started</dd>
            <dt>Engagement</dt>
            <dd>Experience completed</dd>
            <dt>Retention</dt>
            <dd>Returned or renewed</dd>
            <dt>Feedback</dt>
            <dd>Survey submitted</dd>
            <dt>Advocacy</dt>
            <dd>Verified referral conversion</dd>
          </dl>
          <p className="card-footer muted">
            <small>
              Future metrics must define unique people, time windows, deduplication, and tenant ownership
              before being used in decisions.
            </small>
          </p>
        </Card>
      </div>
    </>
  );
}
