import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Feedback } from '../domain/feedback';
import { APP_VERSION, DEMO_MODE } from '../config/runtime';
import { useAuth } from '../providers/AuthProvider';
import { useOrganization } from '../providers/OrganizationProvider';
import { useAction } from '../lib/useAction';
import { feedbackService } from '../services/lifecycleServices';
import { ActionStatus, Button, Checkbox, Input, Select, TextArea, SkeletonNote } from './ui';
export function FeedbackForm() {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const { pathname } = useLocation();
  const action = useAction();
  const [category, setCategory] = useState<Feedback['category']>('idea');
  const [message, setMessage] = useState('');
  const [metadata, setMetadata] = useState(false);
  const [file, setFile] = useState<File>();
  async function submit() {
    await action.run(
      async () => {
        if (!user || user.isAnonymous) throw new Error('Sign in to share feedback.');
        if (!message.trim()) throw new Error('Add a message.');
        if (
          file &&
          (file.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
        )
          throw new Error('Choose a PNG, JPEG, or WebP image smaller than 5 MB.');
        const now = new Date().toISOString();
        const feedback: Feedback = {
          id: crypto.randomUUID(),
          organizationId: organization?.id ?? null,
          userId: user.uid,
          category,
          message: message.trim(),
          attachmentName: file?.name ?? null,
          attachmentStoragePath: null,
          currentScreen: pathname,
          appVersion: APP_VERSION,
          deviceMetadata: metadata
            ? {
                viewport: `${window.innerWidth}×${window.innerHeight}`,
                userAgent: navigator.userAgent.slice(0, 500),
              }
            : null,
          status: 'new',
          createdAt: now,
          updatedAt: now,
        };
        await feedbackService.submit(feedback, file);
      },
      DEMO_MODE
        ? 'Feedback preview saved in demo memory. The selected image was not uploaded.'
        : 'Feedback submitted.',
    );
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Select
        label="Category"
        value={category}
        onChange={(event) => setCategory(event.target.value as Feedback['category'])}
      >
        <option value="idea">An idea</option>
        <option value="problem">Something isn’t working</option>
        <option value="experience">My experience</option>
        <option value="other">Something else</option>
      </Select>
      <TextArea
        label="What would you like us to know?"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        required
        maxLength={4000}
      />
      <Input
        label="Screenshot (optional)"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => setFile(event.target.files?.[0])}
        hint="PNG, JPEG, or WebP, up to 5 MB. Upload storage is not connected in this skeleton."
      />
      <Checkbox
        label="Include browser and screen-size details to help troubleshoot"
        checked={metadata}
        onChange={(event) => setMetadata(event.target.checked)}
      />
      <p className="muted">
        <small>
          Included by default: this page’s path and app version. Query parameters and invitation tokens are
          never attached.
        </small>
      </p>
      <SkeletonNote>
        {DEMO_MODE
          ? 'This feedback stays in demo memory. Image files are never uploaded.'
          : 'Feedback delivery is not connected yet. This form cannot submit to a live organization.'}
      </SkeletonNote>
      <Button type="submit" disabled={action.working}>
        {DEMO_MODE ? 'Save demo feedback' : 'Preview feedback submission'}
      </Button>
      <ActionStatus {...action} />
    </form>
  );
}
