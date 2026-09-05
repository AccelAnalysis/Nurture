import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { MessageTemplate, TemplateType } from '../../domain/outreach';
import { useOrganization } from '../../providers/OrganizationProvider';
import { templateService } from '../../services/lifecycleServices';
import { useAsync } from '../../lib/useAsync';
import { useAction } from '../../lib/useAction';
import { DEMO_MODE } from '../../config/runtime';
import { FeatureUnavailableError } from '../../lib/errors';
import {
  ActionStatus,
  Badge,
  Button,
  Card,
  Input,
  LinkButton,
  PageHeader,
  Select,
  SkeletonNote,
  TextArea,
} from '../../components/ui';
import { Icon } from '../../components/Icon';
import { DataTable } from '../../components/DataTable';
import { ResourceState } from '../../components/ResourceState';
const templateTypes: [TemplateType, string][] = [
  ['welcome', 'Welcome'],
  ['registration', 'Registration'],
  ['invitation', 'Invitation'],
  ['thankYou', 'Thank-you'],
  ['survey', 'Survey request'],
  ['followUp', 'Follow-up'],
  ['offer', 'Offer'],
  ['upgrade', 'Upgrade'],
  ['winBack', 'Win-back'],
  ['referral', 'Referral request'],
];
export function TemplatesPage() {
  const { organization } = useOrganization();
  const id = organization!.id;
  const base = `/org/${id}/templates`;
  const result = useAsync(useCallback(() => templateService.list(id), [id]));
  const [channel, setChannel] = useState('all');
  return (
    <>
      <PageHeader
        title="Message templates"
        eyebrow="A consistent, personal voice"
        description="Reusable email and SMS messages for each part of the customer relationship."
        actions={
          <LinkButton to={`${base}/new`}>
            <Icon name="plus" />
            New template
          </LinkButton>
        }
      />
      <div className="toolbar">
        <Select label="Channel" value={channel} onChange={(event) => setChannel(event.target.value)}>
          <option value="all">Email & SMS</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </Select>
      </div>
      <ResourceState result={result}>
        {(templates) => (
          <DataTable
            caption="Organization message templates"
            rows={templates.filter((template) => channel === 'all' || template.channel === channel)}
            emptyTitle="No templates in this channel"
            columns={[
              {
                key: 'name',
                label: 'Template',
                render: (template) => <Link to={`${base}/${template.id}`}>{template.name}</Link>,
              },
              {
                key: 'type',
                label: 'Purpose',
                render: (template) => templateTypes.find(([type]) => type === template.type)?.[1],
              },
              { key: 'channel', label: 'Channel', render: (template) => template.channel.toUpperCase() },
              { key: 'status', label: 'Status', render: (template) => <Badge>{template.status}</Badge> },
              { key: 'version', label: 'Version', render: (template) => template.version },
            ]}
          />
        )}
      </ResourceState>
      <SkeletonNote>
        SendGrid and Twilio credentials stay server-side. Editing a template never sends a message.
      </SkeletonNote>
    </>
  );
}
function blankTemplate(organizationId: string): MessageTemplate {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    organizationId,
    name: 'New message',
    type: 'followUp',
    channel: 'email',
    subject: 'A useful next step',
    body: 'Hi {{first_name}},\n\nThank you for joining {{organization_name}}. Here is your next experience: {{experience_url}}',
    variables: [],
    status: 'draft',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}
export function TemplateEditorPage() {
  const { templateId } = useParams();
  const { organization } = useOrganization();
  const id = organization!.id;
  const result = useAsync(
    useCallback(
      () => (templateId ? templateService.get(id, templateId) : Promise.resolve(blankTemplate(id))),
      [id, templateId],
    ),
  );
  return (
    <>
      <PageHeader
        title="Shape the next message"
        description="Write clear, useful follow-ups. The preview is escaped text, not executable HTML."
      />
      <ResourceState result={result}>
        {(template) => <TemplateEditor key={template.id} initial={template} />}
      </ResourceState>
    </>
  );
}
function TemplateEditor({ initial }: { initial: MessageTemplate }) {
  const [template, setTemplate] = useState(initial);
  const action = useAction();
  const navigate = useNavigate();
  const base = `/org/${initial.organizationId}/templates`;
  const values: Record<string, string> = {
    first_name: 'Avery',
    organization_name: 'Nurture Demo Organization',
    inviter_name: 'Alex',
    experience_name: 'Welcome experience',
    experience_url: '[experience link]',
    account_url: '[account link]',
    invitation_url: '[secure invitation link]',
    survey_url: '[survey link]',
    offer_name: 'Keep growing',
    offer_url: '[offer link]',
    referral_url: '[verified referral link]',
  };
  const preview = (text: string) =>
    text.replace(/\{\{([a-z_]+)\}\}/g, (match: string, key: string) => values[key] ?? match);
  async function save() {
    const variables = [...new Set(`${template.subject} ${template.body}`.match(/\{\{[a-z_]+\}\}/g) ?? [])];
    if (
      await action.run(
        async () => {
          if (
            !template.name.trim() ||
            !template.body.trim() ||
            (template.channel === 'email' && !template.subject.trim())
          )
            throw new Error('Add a template name, message body, and email subject where applicable.');
          const updated = {
            ...template,
            variables,
            version: template.version + 1,
            updatedAt: new Date().toISOString(),
          };
          await templateService.save(initial.organizationId, updated);
          setTemplate(updated);
        },
        DEMO_MODE ? 'Template saved in demo memory. No message sent.' : 'Template saved.',
      )
    )
      navigate(`${base}/${template.id}`, { replace: true });
  }
  return (
    <>
      <div className="grid two">
        <Card>
          <h2>Message details</h2>
          <Input
            label="Template name"
            value={template.name}
            onChange={(event) => setTemplate({ ...template, name: event.target.value })}
            maxLength={100}
          />
          <div className="form-grid">
            <Select
              label="Purpose"
              value={template.type}
              onChange={(event) => setTemplate({ ...template, type: event.target.value as TemplateType })}
            >
              {templateTypes.map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              label="Channel"
              value={template.channel}
              onChange={(event) =>
                setTemplate({ ...template, channel: event.target.value as 'email' | 'sms' })
              }
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </Select>
          </div>
          {template.channel === 'email' && (
            <Input
              label="Subject"
              value={template.subject}
              onChange={(event) => setTemplate({ ...template, subject: event.target.value })}
              maxLength={200}
            />
          )}
          <TextArea
            label="Message body"
            rows={9}
            value={template.body}
            onChange={(event) => setTemplate({ ...template, body: event.target.value })}
            maxLength={10000}
          />
          <Select
            label="Status"
            value={template.status}
            onChange={(event) =>
              setTemplate({ ...template, status: event.target.value as MessageTemplate['status'] })
            }
          >
            <option value="draft">Draft</option>
            <option value="published">Published configuration</option>
            <option value="archived">Archived</option>
          </Select>
          <small>
            {template.body.length} characters · SMS encoding, segment calculation, and final compliance footer
            are future server concerns.
          </small>
        </Card>
        <div className="stack">
          <Card>
            <div className="row">
              <h2>Preview</h2>
              <Badge>Fictional recipient</Badge>
            </div>
            <div className="template-preview">
              <small>TO: AVERY · EXAMPLE RECIPIENT</small>
              {template.channel === 'email' && <h3 style={{ marginTop: 22 }}>{preview(template.subject)}</h3>}
              <p>{preview(template.body)}</p>
              <small>
                {template.channel === 'email'
                  ? 'Future server footer: sender identity, mailing address, and purpose-appropriate unsubscribe link.'
                  : 'Future server footer: sender identity and applicable opt-out instruction.'}
              </small>
            </div>
          </Card>
          <Card>
            <h3>Personalization variables</h3>
            <p className="muted">
              <small>
                {Object.keys(values)
                  .map((key) => `{{${key}}}`)
                  .join(' · ')}
              </small>
            </p>
            <SkeletonNote>
              Links must be generated from trusted tenant context. Do not paste private invitation tokens or
              personal information into reusable templates.
            </SkeletonNote>
          </Card>
        </div>
      </div>
      <div className="section actions">
        <Button
          disabled={action.working}
          onClick={() => {
            void save();
          }}
        >
          Save template
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            void action.run(async () => {
              throw new FeatureUnavailableError('Test message delivery');
            });
          }}
        >
          Preview test send
        </Button>
        <LinkButton variant="quiet" to={base}>
          All templates
        </LinkButton>
      </div>
      <ActionStatus {...action} />
    </>
  );
}
