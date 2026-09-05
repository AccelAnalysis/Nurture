import type { AuditFields, Instant } from './identity';
export interface Feedback extends AuditFields {
  id: string;
  organizationId: string | null;
  userId: string;
  category: 'idea' | 'problem' | 'experience' | 'other';
  message: string;
  attachmentName: string | null;
  attachmentStoragePath: string | null;
  currentScreen: string;
  appVersion: string;
  deviceMetadata: { viewport: string; userAgent?: string } | null;
  status: 'new' | 'reviewing' | 'resolved';
}
export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  href: string;
  createdAt: Instant;
  readAt: Instant | null;
}
