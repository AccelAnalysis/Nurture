import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ContactSequence, SequenceStep } from '../../domain/outreach';
import { validateSequence } from '../../domain/validation';
import { useOrganization } from '../../providers/OrganizationProvider';
import { sequenceService, templateService } from '../../services/lifecycleServices';
import { useAsync } from '../../lib/useAsync';
import { useAction } from '../../lib/useAction';
import { DEMO_MODE } from '../../config/runtime';
import {
  ActionStatus,
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  LinkButton,
  PageHeader,
  Select,
  SkeletonNote,
} from '../../components/ui';
import { Icon } from '../../components/Icon';
import { DataTable } from '../../components/DataTable';
import { ResourceState } from '../../components/ResourceState';
export function SequencesPage() {
  const { organization } = useOrganization();
  const id = organization!.id;
  const base = `/org/${id}/sequences`;
  const result = useAsync(useCallback(() => sequenceService.list(id), [id]));
  return (
    <>
      <PageHeader
        eyebrow="Thoughtful follow-up"
        title="Contact sequences"
        description="Connect experience events to a considered series of messages. Timing, consent, and stop conditions stay visible."
        actions={
          <LinkButton to={`${base}/new`}>
            <Icon name="plus" />
            New sequence
          </LinkButton>
        }
      />
      <SkeletonNote>
        No production scheduler is installed. Publishing or enabling a sequence in the demo only changes its
        fictional configuration.
      </SkeletonNote>
      <ResourceState result={result}>
        {(sequences) => (
          <DataTable
            caption="Organization contact sequences"
            rows={sequences}
            columns={[
              {
                key: 'name',
                label: 'Sequence',
                render: (sequence) => <Link to={`${base}/${sequence.id}`}>{sequence.name}</Link>,
              },
              {
                key: 'trigger',
                label: 'Starts when',
                render: (sequence) =>
                  sequence.trigger === 'experienceCompleted'
                    ? 'Experience completed'
                    : sequence.trigger === 'contactAdded'
                      ? 'Contact added'
                      : 'Invitation accepted',
              },
              { key: 'steps', label: 'Steps', render: (sequence) => sequence.steps.length },
              { key: 'status', label: 'Status', render: (sequence) => <Badge>{sequence.status}</Badge> },
              {
                key: 'enabled',
                label: 'Configuration',
                render: (sequence) => (
                  <Badge tone={sequence.enabled ? 'positive' : 'neutral'}>
                    {sequence.enabled ? 'Enabled · no scheduler' : 'Disabled'}
                  </Badge>
                ),
              },
            ]}
            emptyTitle="No sequences yet"
            emptyDescription="Create a draft to define the timing and purpose of your first follow-up."
          />
        )}
      </ResourceState>
    </>
  );
}
function blankSequence(organizationId: string): ContactSequence {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    organizationId,
    name: 'New follow-up sequence',
    trigger: 'experienceCompleted',
    status: 'draft',
    enabled: false,
    steps: [
      {
        id: crypto.randomUUID(),
        kind: 'email',
        name: 'Thank your participant',
        delayDays: 0,
        templateId: null,
        consentPurpose: 'service',
      },
    ],
    timeZone: 'America/New_York',
    quietHours: { start: '20:00', end: '09:00' },
    frequencyCapPerDay: 2,
    stopOnConversion: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}
export function SequenceEditorPage() {
  const { sequenceId } = useParams();
  const { organization } = useOrganization();
  const id = organization!.id;
  const result = useAsync(
    useCallback(
      () => (sequenceId ? sequenceService.get(id, sequenceId) : Promise.resolve(blankSequence(id))),
      [id, sequenceId],
    ),
  );
  return (
    <>
      <PageHeader
        title="Design a thoughtful follow-up"
        description="Every day value is measured from the trigger, not the previous step. Day 7 means seven days after experience completion."
      />
      <ResourceState result={result}>
        {(sequence) => <SequenceEditor key={sequence.id} initial={sequence} />}
      </ResourceState>
    </>
  );
}
function SequenceEditor({ initial }: { initial: ContactSequence }) {
  const [sequence, setSequence] = useState(initial);
  const action = useAction();
  const navigate = useNavigate();
  const base = `/org/${initial.organizationId}/sequences`;
  const templates = useAsync(
    useCallback(() => templateService.list(initial.organizationId), [initial.organizationId]),
  );
  function updateStep(id: string, patch: Partial<SequenceStep>) {
    setSequence((current) => ({
      ...current,
      steps: current.steps.map((step) => (step.id === id ? { ...step, ...patch } : step)),
    }));
  }
  function addStep() {
    setSequence((current) => ({
      ...current,
      status: 'draft',
      enabled: false,
      steps: [
        ...current.steps,
        {
          id: crypto.randomUUID(),
          kind: 'email',
          name: 'A useful follow-up',
          delayDays: Math.min(365, (current.steps.at(-1)?.delayDays ?? 0) + 7),
          templateId: null,
          consentPurpose: 'marketing',
        },
      ],
    }));
  }
  async function save(status: ContactSequence['status']) {
    const updated = {
      ...sequence,
      status,
      enabled: status === 'published' && sequence.enabled,
      version: sequence.version + 1,
      updatedAt: new Date().toISOString(),
    };
    if (
      await action.run(
        async () => {
          const error = validateSequence(updated);
          if (error) throw new Error(error);
          await sequenceService.save(initial.organizationId, updated);
        },
        DEMO_MODE
          ? `${status === 'published' ? 'Published' : 'Saved'} in demo memory. No messages are scheduled.`
          : 'Sequence saved.',
      )
    ) {
      setSequence(updated);
      navigate(`${base}/${updated.id}`, { replace: true });
    }
  }
  return (
    <>
      <div className="editor-layout">
        <div>
          <div className="sequence-trigger">
            <Icon name="check" />
            <div>
              <strong>Start from a meaningful event</strong>
              <p>Future enrollments must be deduplicated and permission-checked.</p>
            </div>
          </div>
          <div className="stack">
            {sequence.steps.map((step, index) => (
              <div className="sequence-step" key={step.id}>
                <div className="sequence-time">
                  DAY<strong>{step.delayDays}</strong>
                </div>
                <Card>
                  <div className="step-heading">
                    <span>
                      <Icon
                        name={
                          step.kind === 'sms'
                            ? 'bell'
                            : step.kind === 'survey'
                              ? 'feedback'
                              : step.kind === 'offer'
                                ? 'offers'
                                : step.kind === 'referral'
                                  ? 'share'
                                  : 'mail'
                        }
                      />
                      Step {index + 1}
                    </span>
                    <Button
                      variant="quiet"
                      aria-label={`Remove step ${index + 1}`}
                      onClick={() =>
                        setSequence({
                          ...sequence,
                          steps: sequence.steps.filter((item) => item.id !== step.id),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <Input
                    label={`Step ${index + 1} name`}
                    value={step.name}
                    maxLength={100}
                    onChange={(event) => updateStep(step.id, { name: event.target.value })}
                  />
                  <div className="form-grid">
                    <Select
                      label={`Step ${index + 1} action`}
                      value={step.kind}
                      onChange={(event) =>
                        updateStep(step.id, { kind: event.target.value as SequenceStep['kind'] })
                      }
                    >
                      <option value="email">Email</option>
                      <option value="sms">SMS</option>
                      <option value="survey">Survey request</option>
                      <option value="offer">Offer</option>
                      <option value="referral">Referral request</option>
                    </Select>
                    <Input
                      label={`Step ${index + 1} days from trigger`}
                      type="number"
                      min={0}
                      max={365}
                      step={1}
                      value={step.delayDays}
                      onChange={(event) => updateStep(step.id, { delayDays: Number(event.target.value) })}
                    />
                  </div>
                  <Select
                    label={`Step ${index + 1} message template`}
                    value={step.templateId ?? ''}
                    onChange={(event) => updateStep(step.id, { templateId: event.target.value || null })}
                  >
                    <option value="">Choose later</option>
                    {templates.data?.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · {template.channel.toUpperCase()}
                      </option>
                    ))}
                  </Select>
                  <div className="form-grid">
                    <Select
                      label={`Step ${index + 1} permission purpose`}
                      value={step.consentPurpose}
                      onChange={(event) =>
                        updateStep(step.id, {
                          consentPurpose: event.target.value as SequenceStep['consentPurpose'],
                        })
                      }
                    >
                      <option value="service">Service communication</option>
                      <option value="marketing">Marketing</option>
                    </Select>
                    <Select
                      label={`Step ${index + 1} skip condition`}
                      value={step.skipIf ?? ''}
                      onChange={(event) => {
                        const skipIf = event.target.value as SequenceStep['skipIf'];
                        updateStep(step.id, { skipIf: skipIf || undefined });
                      }}
                    >
                      <option value="">No extra condition</option>
                      <option value="surveyCompleted">Survey already completed</option>
                      <option value="converted">Already converted</option>
                      <option value="optedOut">Opted out</option>
                    </Select>
                  </div>
                  {step.kind === 'survey' && (
                    <Input
                      label={`Step ${index + 1} survey ID`}
                      value={step.surveyId ?? ''}
                      onChange={(event) => updateStep(step.id, { surveyId: event.target.value })}
                      hint="A future publish validator will require a published, tenant-owned survey."
                    />
                  )}
                  {step.kind === 'offer' && (
                    <Input
                      label={`Step ${index + 1} offer ID`}
                      value={step.offerId ?? ''}
                      onChange={(event) => updateStep(step.id, { offerId: event.target.value })}
                    />
                  )}
                </Card>
              </div>
            ))}
            <Button variant="secondary" onClick={addStep} disabled={sequence.steps.length >= 20}>
              <Icon name="plus" />
              Add a sequence step
            </Button>
          </div>
        </div>
        <aside className="editor-aside stack">
          <Card>
            <h2>Sequence settings</h2>
            <Input
              label="Sequence name"
              value={sequence.name}
              onChange={(event) => setSequence({ ...sequence, name: event.target.value })}
              maxLength={100}
            />
            <Select
              label="Enrollment trigger"
              value={sequence.trigger}
              onChange={(event) =>
                setSequence({ ...sequence, trigger: event.target.value as ContactSequence['trigger'] })
              }
            >
              <option value="experienceCompleted">Experience completed</option>
              <option value="contactAdded">Contact added</option>
              <option value="invitationAccepted">Invitation accepted</option>
            </Select>
            <Input
              label="Time zone"
              value={sequence.timeZone}
              onChange={(event) => setSequence({ ...sequence, timeZone: event.target.value })}
            />
            <div className="form-grid">
              <Input
                label="Quiet hours start"
                type="time"
                value={sequence.quietHours.start}
                onChange={(event) =>
                  setSequence({
                    ...sequence,
                    quietHours: { ...sequence.quietHours, start: event.target.value },
                  })
                }
              />
              <Input
                label="Quiet hours end"
                type="time"
                value={sequence.quietHours.end}
                onChange={(event) =>
                  setSequence({
                    ...sequence,
                    quietHours: { ...sequence.quietHours, end: event.target.value },
                  })
                }
              />
            </div>
            <Input
              label="Messages per contact per day"
              type="number"
              min={1}
              max={10}
              value={sequence.frequencyCapPerDay}
              onChange={(event) =>
                setSequence({ ...sequence, frequencyCapPerDay: Number(event.target.value) })
              }
            />
            <Checkbox
              label="Stop when the contact converts"
              checked={sequence.stopOnConversion}
              onChange={(event) => setSequence({ ...sequence, stopOnConversion: event.target.checked })}
            />
            <Checkbox
              label="Enabled configuration (no live scheduler)"
              checked={sequence.enabled}
              onChange={(event) => setSequence({ ...sequence, enabled: event.target.checked })}
            />
            <div className="card-footer">
              <Badge>
                {sequence.status} · version {sequence.version}
              </Badge>
            </div>
          </Card>
          <SkeletonNote>
            Consent withdrawal, missing permission, failed delivery, and frequency limits must be checked
            again at send time, not only at enrollment.
          </SkeletonNote>
        </aside>
      </div>
      <div className="section actions">
        <Button
          onClick={() => {
            void save('draft');
          }}
          disabled={action.working}
        >
          Save draft
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            void save('published');
          }}
          disabled={action.working}
        >
          {DEMO_MODE ? 'Publish demo configuration' : 'Preview publishing'}
        </Button>
        <LinkButton variant="quiet" to={base}>
          All sequences
        </LinkButton>
      </div>
      <ActionStatus {...action} />
    </>
  );
}
