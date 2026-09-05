import type { ExperienceContact } from '../domain/lifecycle';
import type { ContactSequence, MessageTemplate, Survey, SurveyResponse } from '../domain/outreach';
import type { Feedback, AppNotification } from '../domain/feedback';
import {
  DEMO_ORG,
  demoContacts,
  demoSequence,
  demoTemplates,
  demoSurvey,
  demoFeedback,
  demoNotifications,
} from '../demo/data';
import { DEMO_MODE } from '../config/runtime';
import { FeatureUnavailableError } from '../lib/errors';
import { scopedRepository, readOne, readMany, pathId } from './repository';
export const contactService = scopedRepository<ExperienceContact>(
  'Contacts',
  demoContacts,
  (id) => `organizations/${id}/contacts`,
  DEMO_ORG,
);
export const sequenceService = scopedRepository<ContactSequence>(
  'Sequences',
  [demoSequence],
  (id) => `organizations/${id}/sequences`,
  DEMO_ORG,
);
export const templateService = scopedRepository<MessageTemplate>(
  'Message templates',
  demoTemplates,
  (id) => `organizations/${id}/messageTemplates`,
  DEMO_ORG,
);
const demoResponses = new Map<string, SurveyResponse[]>();
export const surveyService = {
  ...scopedRepository<Survey>('Surveys', [demoSurvey], (id) => `organizations/${id}/surveys`, DEMO_ORG),
  async getPublic(id: string): Promise<Survey | null> {
    const survey = DEMO_MODE
      ? await surveyService.get(DEMO_ORG, id)
      : await readOne<Survey>(`publicSurveys/${pathId(id)}`);
    return survey?.status === 'published' && survey.visibility === 'public' ? survey : null;
  },
  async submit(response: SurveyResponse): Promise<void> {
    if (!DEMO_MODE) throw new FeatureUnavailableError('Survey response submission');
    const key = `${response.organizationId}/${response.surveyId}`;
    demoResponses.set(key, [...(demoResponses.get(key) ?? []), structuredClone(response)]);
  },
  async results(organizationId: string, surveyId: string): Promise<SurveyResponse[]> {
    return DEMO_MODE
      ? structuredClone(demoResponses.get(`${organizationId}/${surveyId}`) ?? [])
      : readMany<SurveyResponse>(
          `organizations/${pathId(organizationId)}/surveys/${pathId(surveyId)}/responses`,
        );
  },
};
export const feedbackService = {
  ...scopedRepository<Feedback>('Feedback', demoFeedback, (id) => `organizations/${id}/feedback`, DEMO_ORG),
  async submit(_feedback: Feedback, _file?: File): Promise<void> {
    if (!DEMO_MODE) throw new FeatureUnavailableError('Feedback delivery and secure file upload');
    await feedbackService.save(_feedback.organizationId ?? `personal-${_feedback.userId}`, _feedback);
  },
};
export const notificationService = scopedRepository<AppNotification>(
  'Notification updates',
  demoNotifications,
  (uid) => `users/${uid}/notifications`,
  'demo-owner',
);
