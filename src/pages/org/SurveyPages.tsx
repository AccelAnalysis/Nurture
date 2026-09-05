import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { QuestionType, Survey, SurveyQuestion } from '../../domain/outreach';
import { validateSurvey } from '../../domain/validation';
import { useOrganization } from '../../providers/OrganizationProvider';
import { surveyService } from '../../services/lifecycleServices';
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
  TextArea,
  Tabs,
} from '../../components/ui';
import { Icon } from '../../components/Icon';
import { DataTable } from '../../components/DataTable';
import { ResourceState } from '../../components/ResourceState';
import { SurveyForm } from '../../components/SurveyForm';
const questionTypes: [QuestionType, string][] = [
  ['shortText', 'Short text'],
  ['longText', 'Long text'],
  ['singleChoice', 'Single choice'],
  ['multipleChoice', 'Multiple choice'],
  ['rating', 'Rating · 1–5'],
  ['nps', 'NPS-style · 0–10'],
  ['yesNo', 'Yes / No'],
];
export function SurveysPage() {
  const { organization } = useOrganization();
  const id = organization!.id;
  const base = `/org/${id}/surveys`;
  const result = useAsync(useCallback(() => surveyService.list(id), [id]));
  return (
    <>
      <PageHeader
        eyebrow="Feedback worth learning from"
        title="Survey templates"
        description="Reusable surveys for listening after an experience and improving what comes next."
        actions={
          <LinkButton to={`${base}/new`}>
            <Icon name="plus" />
            New survey
          </LinkButton>
        }
      />
      <ResourceState result={result}>
        {(surveys) => (
          <DataTable
            rows={surveys}
            caption="Organization survey templates"
            columns={[
              {
                key: 'title',
                label: 'Survey',
                render: (survey) => <Link to={`${base}/${survey.id}`}>{survey.title}</Link>,
              },
              { key: 'questions', label: 'Questions', render: (survey) => survey.questions.length },
              { key: 'visibility', label: 'Visibility', render: (survey) => survey.visibility },
              { key: 'status', label: 'Status', render: (survey) => <Badge>{survey.status}</Badge> },
              {
                key: 'preview',
                label: 'Review',
                render: (survey) => <Link to={`${base}/${survey.id}/preview`}>Preview</Link>,
              },
              {
                key: 'results',
                label: 'Responses',
                render: (survey) => <Link to={`${base}/${survey.id}/results`}>View results</Link>,
              },
            ]}
            emptyTitle="No survey templates yet"
          />
        )}
      </ResourceState>
      <SkeletonNote>
        Publishing a public survey requires a sanitized, server-managed projection. Responses are never
        publicly readable.
      </SkeletonNote>
    </>
  );
}
function blankSurvey(organizationId: string): Survey {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    organizationId,
    title: 'A few thoughts on your experience',
    description: 'Your feedback helps shape what comes next.',
    questions: [
      {
        id: crypto.randomUUID(),
        type: 'rating',
        title: 'How was your overall experience?',
        required: true,
        options: [],
      },
    ],
    completionMessage: 'Thank you for your perspective.',
    visibility: 'private',
    status: 'draft',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}
export function SurveyEditorPage() {
  const { surveyId } = useParams();
  const { organization } = useOrganization();
  const id = organization!.id;
  const result = useAsync(
    useCallback(
      () => (surveyId ? surveyService.get(id, surveyId) : Promise.resolve(blankSurvey(id))),
      [id, surveyId],
    ),
  );
  return (
    <>
      <PageHeader
        title="Build a better conversation"
        description="Keep surveys purposeful, voluntary, and easy to complete."
      />
      <ResourceState result={result}>
        {(survey) => <SurveyEditor key={survey.id} initial={survey} />}
      </ResourceState>
    </>
  );
}
function SurveyEditor({ initial }: { initial: Survey }) {
  const [survey, setSurvey] = useState(initial);
  const action = useAction();
  const navigate = useNavigate();
  const base = `/org/${initial.organizationId}/surveys`;
  function updateQuestion(id: string, patch: Partial<SurveyQuestion>) {
    setSurvey((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === id ? { ...question, ...patch } : question,
      ),
    }));
  }
  async function save() {
    const updated = { ...survey, version: survey.version + 1, updatedAt: new Date().toISOString() };
    if (
      await action.run(
        async () => {
          const error = validateSurvey(updated);
          if (error) throw new Error(error);
          await surveyService.save(initial.organizationId, updated);
        },
        DEMO_MODE ? 'Survey saved in demo memory.' : 'Survey saved.',
      )
    ) {
      setSurvey(updated);
      navigate(`${base}/${updated.id}`, { replace: true });
    }
  }
  return (
    <>
      <div className="editor-layout">
        <div className="stack">
          <Card>
            <Input
              label="Survey title"
              value={survey.title}
              maxLength={160}
              onChange={(event) => setSurvey({ ...survey, title: event.target.value })}
            />
            <TextArea
              label="Introduction"
              value={survey.description}
              onChange={(event) => setSurvey({ ...survey, description: event.target.value })}
              maxLength={1500}
              rows={3}
            />
          </Card>
          {survey.questions.map((question, index) => (
            <Card key={question.id}>
              <div className="step-heading">
                <span>Question {index + 1}</span>
                <Button
                  variant="quiet"
                  onClick={() =>
                    setSurvey({
                      ...survey,
                      questions: survey.questions.filter((item) => item.id !== question.id),
                    })
                  }
                  aria-label={`Remove question ${index + 1}`}
                >
                  Remove
                </Button>
              </div>
              <Input
                label={`Question ${index + 1} title`}
                value={question.title}
                onChange={(event) => updateQuestion(question.id, { title: event.target.value })}
                maxLength={300}
              />
              <Select
                label={`Question ${index + 1} type`}
                value={question.type}
                onChange={(event) =>
                  updateQuestion(question.id, { type: event.target.value as QuestionType })
                }
              >
                {questionTypes.map(([type, label]) => (
                  <option key={type} value={type}>
                    {label}
                  </option>
                ))}
              </Select>
              {['singleChoice', 'multipleChoice'].includes(question.type) && (
                <TextArea
                  label={`Question ${index + 1} options (one per line)`}
                  value={question.options.join('\n')}
                  onChange={(event) =>
                    updateQuestion(question.id, { options: event.target.value.split('\n') })
                  }
                  maxLength={2000}
                />
              )}
              <Checkbox
                label={`Question ${index + 1} is required`}
                checked={question.required}
                onChange={(event) => updateQuestion(question.id, { required: event.target.checked })}
              />
            </Card>
          ))}
          <Button
            variant="secondary"
            disabled={survey.questions.length >= 20}
            onClick={() =>
              setSurvey({
                ...survey,
                status: 'draft',
                questions: [
                  ...survey.questions,
                  {
                    id: crypto.randomUUID(),
                    type: 'shortText',
                    title: 'What would you like to share?',
                    required: false,
                    options: [],
                  },
                ],
              })
            }
          >
            <Icon name="plus" />
            Add question
          </Button>
        </div>
        <aside className="editor-aside stack">
          <Card>
            <h2>Survey settings</h2>
            <Select
              label="Status"
              value={survey.status}
              onChange={(event) => setSurvey({ ...survey, status: event.target.value as Survey['status'] })}
            >
              <option value="draft">Draft</option>
              <option value="published">Published configuration</option>
              <option value="archived">Archived</option>
            </Select>
            <Select
              label="Audience"
              value={survey.visibility}
              onChange={(event) =>
                setSurvey({ ...survey, visibility: event.target.value as Survey['visibility'] })
              }
            >
              <option value="private">Private organization survey</option>
              <option value="public">Public response form</option>
            </Select>
            <TextArea
              label="Completion message"
              value={survey.completionMessage}
              onChange={(event) => setSurvey({ ...survey, completionMessage: event.target.value })}
              maxLength={500}
            />
            <Badge>Version {survey.version}</Badge>
          </Card>
          <SkeletonNote>
            Submitting feedback is not marketing consent. Do not collect sensitive personal information in an
            open survey.
          </SkeletonNote>
        </aside>
      </div>
      <div className="section actions">
        <Button
          onClick={() => {
            void save();
          }}
          disabled={action.working}
        >
          Save survey
        </Button>
        <LinkButton variant="secondary" to={`${base}/${survey.id}/preview`}>
          Preview saved survey
        </LinkButton>
        <LinkButton variant="quiet" to={base}>
          All surveys
        </LinkButton>
      </div>
      <ActionStatus {...action} />
    </>
  );
}
export function SurveyPreviewPage({ publicResponse = false }: { publicResponse?: boolean }) {
  const { surveyId = '' } = useParams();
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? '';
  const result = useAsync(
    useCallback(
      () =>
        publicResponse ? surveyService.getPublic(surveyId) : surveyService.get(organizationId, surveyId),
      [publicResponse, organizationId, surveyId],
    ),
  );
  return (
    <div className="form-narrow">
      {!publicResponse && (
        <Tabs
          items={[
            { label: 'Build', to: `/org/${organizationId}/surveys/${surveyId}` },
            { label: 'Preview', to: `/org/${organizationId}/surveys/${surveyId}/preview` },
            { label: 'Results', to: `/org/${organizationId}/surveys/${surveyId}/results` },
          ]}
        />
      )}
      <ResourceState result={result}>
        {(survey) => (
          <>
            <PageHeader
              eyebrow={publicResponse ? 'Your experience matters' : 'Survey preview'}
              title={survey.title}
              description={survey.description}
            />
            <Card>
              <SurveyForm key={`${survey.id}-${survey.version}`} survey={survey} preview={!publicResponse} />
            </Card>
          </>
        )}
      </ResourceState>
    </div>
  );
}
export function SurveyResultsPage() {
  const { surveyId = '' } = useParams();
  const { organization } = useOrganization();
  const id = organization!.id;
  const base = `/org/${id}/surveys/${surveyId}`;
  const result = useAsync(useCallback(() => surveyService.results(id, surveyId), [id, surveyId]));
  return (
    <>
      <PageHeader
        title="Survey responses"
        description="Responses are private to the permitted organization workspace. Reporting and follow-up interpretation are future features."
      />
      <Tabs
        items={[
          { label: 'Build', to: base },
          { label: 'Preview', to: `${base}/preview` },
          { label: 'Results', to: `${base}/results` },
        ]}
      />
      <ResourceState result={result}>
        {(responses) => (
          <>
            <Card>
              <div className="row">
                <h2>
                  {responses.length} response{responses.length === 1 ? '' : 's'}
                </h2>
                <Badge>{DEMO_MODE ? 'Demo session only' : 'First 100 responses'}</Badge>
              </div>
              <p className="muted">
                Public survey submissions appear here in demo mode. Builder previews are intentionally
                excluded.
              </p>
              <LinkButton variant="secondary" to={`/survey/${surveyId}`}>
                Open public response route
              </LinkButton>
            </Card>
            <section className="section">
              <DataTable
                caption="Private survey responses"
                rows={responses}
                emptyTitle="No responses yet"
                emptyDescription="Publish a public survey configuration in the demo, then submit through its public response page to review a sample here."
                columns={[
                  {
                    key: 'date',
                    label: 'Submitted',
                    render: (response) => new Date(response.submittedAt).toLocaleString(),
                  },
                  { key: 'version', label: 'Survey version', render: (response) => response.surveyVersion },
                  {
                    key: 'answers',
                    label: 'Answers',
                    render: (response) => Object.keys(response.answers).length,
                  },
                  {
                    key: 'identity',
                    label: 'Participant',
                    render: (response) => (response.userId ? 'Signed-in participant' : 'Anonymous response'),
                  },
                ]}
              />
            </section>
          </>
        )}
      </ResourceState>
    </>
  );
}
