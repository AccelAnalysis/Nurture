import { useState } from 'react';
import type { Survey, SurveyResponse } from '../domain/outreach';
import { useAuth } from '../providers/AuthProvider';
import { useAction } from '../lib/useAction';
import { surveyService } from '../services/lifecycleServices';
import { DEMO_MODE } from '../config/runtime';
import { ActionStatus, Button, Checkbox, EmptyState, Input, LinkButton, TextArea, SkeletonNote } from './ui';
type Answers = SurveyResponse['answers'];
export function SurveyForm({ survey, preview = false }: { survey: Survey; preview?: boolean }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [submitted, setSubmitted] = useState(false);
  const { user } = useAuth();
  const action = useAction();
  function answer(id: string, value: Answers[string]) {
    setAnswers((current) => ({ ...current, [id]: value }));
  }
  async function submit() {
    const success = await action.run(
      async () => {
        for (const question of survey.questions) {
          const value = answers[question.id];
          if (
            question.required &&
            (value === undefined || value === '' || (Array.isArray(value) && !value.length))
          )
            throw new Error(`Please answer: ${question.title}`);
        }
        if (!preview)
          await surveyService.submit({
            id: crypto.randomUUID(),
            organizationId: survey.organizationId,
            surveyId: survey.id,
            surveyVersion: survey.version,
            answers,
            userId: user && !user.isAnonymous ? user.uid : null,
            contactId: null,
            submittedAt: new Date().toISOString(),
          });
      },
      preview
        ? 'Preview complete. No response was saved.'
        : DEMO_MODE
          ? 'Response saved in demo memory only.'
          : 'Thank you for your feedback.',
    );
    if (success) setSubmitted(true);
  }
  if (submitted)
    return (
      <>
        <EmptyState
          icon="check"
          title={survey.completionMessage || 'Thank you for your perspective.'}
          description={
            preview
              ? 'Builder preview only. No response was submitted.'
              : DEMO_MODE
                ? 'Your response was saved in this demo session, not a production database.'
                : 'Your feedback has been received.'
          }
        >
          <LinkButton to="/">Discover Nurture</LinkButton>
          {preview && (
            <Button
              variant="secondary"
              onClick={() => {
                setSubmitted(false);
                setAnswers({});
              }}
            >
              Preview again
            </Button>
          )}
        </EmptyState>
        <ActionStatus {...action} />
      </>
    );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {survey.questions.map((question, index) => (
        <fieldset className="question" key={question.id}>
          <legend>
            {index + 1}. {question.title}
            {question.required ? ' (required)' : ' (optional)'}
          </legend>
          {question.type === 'shortText' ? (
            <Input
              label="Your answer"
              name={question.id}
              required={question.required}
              maxLength={500}
              value={String(answers[question.id] ?? '')}
              onChange={(event) => answer(question.id, event.target.value)}
            />
          ) : question.type === 'longText' ? (
            <TextArea
              label="Your answer"
              name={question.id}
              required={question.required}
              maxLength={4000}
              value={String(answers[question.id] ?? '')}
              onChange={(event) => answer(question.id, event.target.value)}
            />
          ) : question.type === 'multipleChoice' ? (
            question.options.map((option) => (
              <Checkbox
                key={option}
                label={option}
                checked={
                  Array.isArray(answers[question.id]) && (answers[question.id] as string[]).includes(option)
                }
                onChange={(event) => {
                  const current = answers[question.id];
                  const values = Array.isArray(current) ? current : [];
                  answer(
                    question.id,
                    event.target.checked ? [...values, option] : values.filter((value) => value !== option),
                  );
                }}
              />
            ))
          ) : question.type === 'rating' || question.type === 'nps' ? (
            <>
              <div className="rating-options">
                {Array.from(
                  { length: question.type === 'nps' ? 11 : 5 },
                  (_, value) => value + (question.type === 'nps' ? 0 : 1),
                ).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name={question.id}
                      value={value}
                      required={question.required}
                      checked={answers[question.id] === value}
                      onChange={() => answer(question.id, value)}
                    />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
              <small>
                {question.type === 'nps'
                  ? '0 = not at all likely · 10 = extremely likely'
                  : '1 = poor · 5 = excellent'}
              </small>
            </>
          ) : (
            (question.type === 'yesNo' ? ['Yes', 'No'] : question.options).map((option) => (
              <label className="checkbox" key={option}>
                <input
                  type="radio"
                  name={question.id}
                  required={question.required}
                  checked={answers[question.id] === (question.type === 'yesNo' ? option === 'Yes' : option)}
                  onChange={() => answer(question.id, question.type === 'yesNo' ? option === 'Yes' : option)}
                />
                <span>{option}</span>
              </label>
            ))
          )}
        </fieldset>
      ))}
      <SkeletonNote>
        {preview
          ? 'Builder preview. Completing this form does not save a response.'
          : DEMO_MODE
            ? 'Demo response only. Submitting does not grant marketing consent or trigger messages.'
            : 'Survey delivery is a protected backend integration and is not connected in this skeleton.'}
      </SkeletonNote>
      <Button type="submit" disabled={action.working}>
        {preview ? 'Preview completion' : DEMO_MODE ? 'Submit demo response' : 'Preview survey submission'}
      </Button>
      <ActionStatus {...action} />
    </form>
  );
}
