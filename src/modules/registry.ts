import type { ExperienceModule } from '../domain/lifecycle';
/** Module metadata is registered in code, never downloaded executable JavaScript. */
export const experienceModules: ExperienceModule[] = [
  {
    id: 'primary',
    title: 'The App Experience',
    description: 'A home for the core experience your organization will provide.',
    slot: 'primary',
    access: 'public',
    status: 'placeholder',
  },
  {
    id: 'secondary',
    title: 'Secondary Experience',
    description: 'A place for continued learning, resources, or the next useful interaction.',
    slot: 'secondary',
    access: 'registered',
    status: 'placeholder',
  },
];
