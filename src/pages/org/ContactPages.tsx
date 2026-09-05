import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ContactStatus, ExperienceContact, PipelineStage } from '../../domain/lifecycle';
import { pipelineStages } from '../../domain/lifecycle';
import { useOrganization } from '../../providers/OrganizationProvider';
import { contactService } from '../../services/lifecycleServices';
import { useAsync } from '../../lib/useAsync';
import { useAction } from '../../lib/useAction';
import { DEMO_MODE } from '../../config/runtime';
import {
  ActionStatus,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  Select,
  SkeletonNote,
  Breadcrumbs,
} from '../../components/ui';
import { Icon } from '../../components/Icon';
import { DataTable } from '../../components/DataTable';
import { ResourceState } from '../../components/ResourceState';
const statuses: ContactStatus[] = [
  'new',
  'invited',
  'participated',
  'engaged',
  'converted',
  'retained',
  'advocate',
  'optedOut',
  'inactive',
];
const displayStatus = (status: string) =>
  status === 'optedOut' ? 'Opted out' : status.charAt(0).toUpperCase() + status.slice(1);
export function ContactsPage() {
  const { organization } = useOrganization();
  const id = organization!.id;
  const base = `/org/${id}/contacts`;
  const result = useAsync(useCallback(() => contactService.list(id), [id]));
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [segment, setSegment] = useState('all');
  return (
    <>
      <PageHeader
        eyebrow="People & relationships"
        title="Experience contacts"
        description="People who have interacted with your experience. A contact is not automatically an app user or organization member."
        actions={
          <>
            <LinkButton variant="secondary" to={`${base}/import`}>
              Import contacts
            </LinkButton>
            <LinkButton to={`${base}/new`}>
              <Icon name="plus" />
              Add contact
            </LinkButton>
          </>
        }
      />
      <div className="toolbar">
        <Input
          label="Search contacts"
          placeholder="Name, email, or tag"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select label="Lifecycle status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {displayStatus(item)}
            </option>
          ))}
        </Select>
        <Select label="Segment" value={segment} onChange={(event) => setSegment(event.target.value)}>
          <option value="all">All contacts</option>
          <option value="followup">Follow-up scheduled</option>
          <option value="advocates">Referral candidates</option>
          <option value="unregistered">Not registered</option>
          <option value="consent">Email marketing permission</option>
        </Select>
      </div>
      <ResourceState result={result}>
        {(contacts) => {
          const filtered = contacts.filter(
            (contact) =>
              `${contact.name} ${contact.email} ${contact.tags.join(' ')}`
                .toLowerCase()
                .includes(search.toLowerCase()) &&
              (status === 'all' || contact.status === status) &&
              (segment === 'all' ||
                (segment === 'followup' && !!contact.nextContactAt) ||
                (segment === 'advocates' && ['advocate', 'retained'].includes(contact.status)) ||
                (segment === 'unregistered' && !contact.linkedUserId) ||
                (segment === 'consent' &&
                  contact.consent.some(
                    (consent) =>
                      consent.channel === 'email' &&
                      consent.purpose === 'marketing' &&
                      consent.state === 'granted',
                  ))),
          );
          return (
            <>
              <p className="muted">
                <small>
                  {filtered.length} of {contacts.length} contacts shown ·{' '}
                  {DEMO_MODE
                    ? 'Fictional sample data'
                    : 'First 100 records; server pagination is a follow-on feature'}
                </small>
              </p>
              <DataTable
                caption="Experience contacts"
                rows={filtered}
                emptyTitle="No contacts match this view"
                columns={[
                  {
                    key: 'name',
                    label: 'Contact',
                    render: (contact) => (
                      <div className="person">
                        <Avatar name={contact.name} />
                        <div>
                          <Link to={`${base}/${contact.id}`}>{contact.name}</Link>
                          <small>{contact.email || contact.phone}</small>
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'stage',
                    label: 'Stage',
                    render: (contact) => (
                      <span>
                        {contact.stage} · {pipelineStages[contact.stage - 1].short}
                      </span>
                    ),
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (contact) => (
                      <Badge tone={contact.status === 'optedOut' ? 'warning' : 'neutral'}>
                        {displayStatus(contact.status)}
                      </Badge>
                    ),
                  },
                  { key: 'source', label: 'Source', render: (contact) => contact.source },
                  {
                    key: 'consent',
                    label: 'Email marketing',
                    render: (contact) => (
                      <Badge
                        tone={
                          contact.consent.some(
                            (c) =>
                              c.channel === 'email' && c.purpose === 'marketing' && c.state === 'granted',
                          )
                            ? 'positive'
                            : 'warning'
                        }
                      >
                        {contact.consent.find((c) => c.channel === 'email' && c.purpose === 'marketing')
                          ?.state ?? 'unknown'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'next',
                    label: 'Next contact',
                    render: (contact) =>
                      contact.nextContactAt
                        ? new Date(contact.nextContactAt).toLocaleDateString()
                        : 'Not scheduled',
                  },
                ]}
              />
            </>
          );
        }}
      </ResourceState>
      <SkeletonNote>
        Contact import, messaging, and registration are separate workflows. Adding a contact never sends an
        invitation or enrolls someone in marketing.
      </SkeletonNote>
    </>
  );
}
export function ContactDetailPage() {
  const { contactId = '' } = useParams();
  const { organization } = useOrganization();
  const id = organization!.id;
  const base = `/org/${id}/contacts`;
  const result = useAsync(useCallback(() => contactService.get(id, contactId), [id, contactId]));
  return (
    <>
      <Breadcrumbs items={[{ label: 'Experience contacts', to: base }, { label: 'Contact detail' }]} />
      <ResourceState result={result}>
        {(contact) => (
          <>
            <PageHeader
              title={contact.name}
              description={contact.email || contact.phone}
              eyebrow="An organization relationship"
              actions={
                <LinkButton variant="secondary" to={`${base}/${contact.id}/edit`}>
                  Edit contact
                </LinkButton>
              }
            />
            <div className="grid two">
              <Card>
                <h2>Relationship at a glance</h2>
                <dl className="key-value">
                  <dt>Lifecycle status</dt>
                  <dd>
                    <Badge>{displayStatus(contact.status)}</Badge>
                  </dd>
                  <dt>Pipeline stage</dt>
                  <dd>{pipelineStages[contact.stage - 1].title}</dd>
                  <dt>Contact source</dt>
                  <dd>{contact.source}</dd>
                  <dt>Nurture account</dt>
                  <dd>
                    {contact.linkedUserId ? 'Linked by trusted workflow' : 'Not registered / not linked'}
                  </dd>
                  <dt>Referral source</dt>
                  <dd>{contact.referralSource ?? 'None recorded'}</dd>
                  <dt>Tags</dt>
                  <dd>{contact.tags.join(', ') || 'No tags'}</dd>
                </dl>
                <div className="card-footer actions">
                  <LinkButton variant="secondary" to={`/org/${id}/sequences`}>
                    Review follow-up sequences
                  </LinkButton>
                </div>
              </Card>
              <Card>
                <h2>Communication consent</h2>
                {contact.consent.map((consent, index) => (
                  <div className="list-row" key={`${consent.channel}-${consent.purpose}-${index}`}>
                    <div>
                      <h3>
                        {consent.channel.toUpperCase()} · {consent.purpose}
                      </h3>
                      <p>{consent.source || 'No source recorded'}</p>
                      <small>
                        {consent.capturedAt
                          ? new Date(consent.capturedAt).toLocaleString()
                          : 'No consent date'}
                        {consent.policyVersion ? ` · ${consent.policyVersion}` : ''}
                      </small>
                    </div>
                    <Badge tone={consent.state === 'granted' ? 'positive' : 'warning'}>{consent.state}</Badge>
                  </div>
                ))}
                <p className="card-footer muted">
                  <small>
                    Unknown or withdrawn permission must suppress the corresponding messages. Service and
                    marketing purposes are evaluated separately.
                  </small>
                </p>
              </Card>
              <Card>
                <h2>Experience participation</h2>
                {contact.participation.length ? (
                  <ul className="timeline">
                    {contact.participation.map((event, index) => (
                      <li key={`${event.experienceId}-${index}`}>
                        <span className="timeline-dot" />
                        <div>
                          <p>{event.experienceName}</p>
                          <small>
                            {event.status} ·{' '}
                            {new Date(event.completedAt ?? event.startedAt).toLocaleDateString()}
                          </small>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title="No participation recorded"
                    description="Verified experience events will populate this timeline."
                  />
                )}
              </Card>
              <Card>
                <h2>Communication history</h2>
                {contact.communicationHistory.length ? (
                  <ul className="timeline">
                    {contact.communicationHistory.map((event) => (
                      <li key={event.id}>
                        <span className="timeline-dot" />
                        <div>
                          <p>{event.subject}</p>
                          <small>
                            {event.channel.toUpperCase()} · {new Date(event.occurredAt).toLocaleDateString()}
                          </small>
                        </div>
                        <Badge>{event.status}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    icon="mail"
                    title="No messages recorded"
                    description="No communication is sent when you create a contact."
                  />
                )}
              </Card>
            </div>
          </>
        )}
      </ResourceState>
    </>
  );
}
function blankContact(organizationId: string): ExperienceContact {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    organizationId,
    linkedUserId: null,
    name: '',
    email: '',
    phone: '',
    status: 'new',
    stage: 1,
    source: 'manual',
    tags: [],
    consent: (['email', 'sms'] as const).flatMap((channel) =>
      (['service', 'marketing'] as const).map((purpose) => ({
        channel,
        purpose,
        state: 'unknown' as const,
        capturedAt: null,
        source: '',
        policyVersion: null,
      })),
    ),
    referralSource: null,
    participation: [],
    communicationHistory: [],
    lastContactAt: null,
    nextContactAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
export function ContactEditorPage() {
  const { contactId } = useParams();
  const { organization } = useOrganization();
  const id = organization!.id;
  const result = useAsync(
    useCallback(
      () => (contactId ? contactService.get(id, contactId) : Promise.resolve(blankContact(id))),
      [id, contactId],
    ),
  );
  return (
    <>
      <PageHeader
        title={contactId ? 'Edit experience contact' : 'Add an experience contact'}
        description="Create a relationship record, not an authentication account. Contact permission is unknown until evidence is recorded."
      />
      <ResourceState result={result}>
        {(contact) => <ContactEditor key={contact.id} initial={contact} />}
      </ResourceState>
    </>
  );
}
function ContactEditor({ initial }: { initial: ExperienceContact }) {
  const [contact, setContact] = useState(initial);
  const [tags, setTags] = useState(initial.tags.join(', '));
  const action = useAction();
  const navigate = useNavigate();
  const base = `/org/${initial.organizationId}/contacts`;
  return (
    <Card className="form-narrow">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action
            .run(
              async () => {
                if (!contact.email.trim() && !contact.phone.trim())
                  throw new Error('Add an email or phone number so this record has a contact method.');
                await contactService.save(initial.organizationId, {
                  ...contact,
                  name: contact.name.trim(),
                  email: contact.email.trim(),
                  tags: tags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                    .slice(0, 12),
                  updatedAt: new Date().toISOString(),
                });
              },
              DEMO_MODE ? 'Contact saved in demo memory.' : 'Contact saved.',
            )
            .then((ok) => {
              if (ok) navigate(`${base}/${contact.id}`);
            });
        }}
      >
        <Input
          label="Name"
          value={contact.name}
          onChange={(event) => setContact({ ...contact, name: event.target.value })}
          maxLength={100}
          required
        />
        <div className="form-grid">
          <Input
            label="Email"
            type="email"
            value={contact.email}
            onChange={(event) => setContact({ ...contact, email: event.target.value })}
            maxLength={254}
          />
          <Input
            label="Phone"
            type="tel"
            value={contact.phone}
            onChange={(event) => setContact({ ...contact, phone: event.target.value })}
            maxLength={30}
          />
        </div>
        <div className="form-grid">
          <Select
            label="Lifecycle status"
            value={contact.status}
            onChange={(event) => setContact({ ...contact, status: event.target.value as ContactStatus })}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {displayStatus(status)}
              </option>
            ))}
          </Select>
          <Select
            label="Pipeline stage"
            value={contact.stage}
            onChange={(event) =>
              setContact({ ...contact, stage: Number(event.target.value) as PipelineStage })
            }
          >
            {pipelineStages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.id} · {stage.title}
              </option>
            ))}
          </Select>
          <Select
            label="Source"
            value={contact.source}
            onChange={(event) =>
              setContact({ ...contact, source: event.target.value as ExperienceContact['source'] })
            }
          >
            {['manual', 'experience', 'import', 'referral'].map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </Select>
          <Input
            label="Referral source note (optional)"
            value={contact.referralSource ?? ''}
            onChange={(event) => setContact({ ...contact, referralSource: event.target.value || null })}
            maxLength={100}
          />
        </div>
        <Input
          label="Tags"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          maxLength={240}
          hint="Separate tags with commas. Up to 12 tags. Referral notes do not create verified attribution."
        />
        <SkeletonNote>
          No consent is inferred from participation, an imported address, or an organization invitation.
          Consent evidence will be managed through a protected follow-on workflow.
        </SkeletonNote>
        <div className="actions">
          <Button type="submit" disabled={action.working}>
            {DEMO_MODE ? 'Save demo contact' : 'Preview contact save'}
          </Button>
          <LinkButton variant="quiet" to={base}>
            Cancel
          </LinkButton>
        </div>
        <ActionStatus {...action} />
      </form>
    </Card>
  );
}
export function ContactImportPage() {
  const { organization } = useOrganization();
  return (
    <>
      <PageHeader
        title="Import experience contacts"
        description="Bring existing relationships into a tenant-scoped contact list without creating accounts or sending messages."
      />
      <Card>
        <EmptyState
          icon="people"
          title="A careful import starts with a review"
          description="The future import workflow will validate rows, find duplicate contact methods within this organization, and require provenance for every consent record."
        >
          <LinkButton to={`/org/${organization!.id}/contacts/new`}>Add a contact manually</LinkButton>
          <LinkButton variant="secondary" to={`/org/${organization!.id}/contacts`}>
            Back to contacts
          </LinkButton>
        </EmptyState>
      </Card>
      <section className="section grid three">
        {[
          [
            '1 · Map fields',
            'Name, contact methods, experience, source, and tags. Never map a contact directly to an Auth user.',
          ],
          [
            '2 · Review duplicates',
            'Match within this organization and review conflicts before merging any records.',
          ],
          [
            '3 · Confirm permissions',
            'Unknown consent remains unknown. Imports do not enroll contacts into sequences automatically.',
          ],
        ].map(([title, text]) => (
          <Card key={title}>
            <h3>{title}</h3>
            <p className="muted">{text}</p>
          </Card>
        ))}
      </section>
    </>
  );
}
