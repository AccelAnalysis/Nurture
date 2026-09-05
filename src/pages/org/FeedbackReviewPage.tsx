import { useCallback, useState } from 'react';
import type { Feedback } from '../../domain/feedback';
import { useOrganization } from '../../providers/OrganizationProvider';
import { useAsync } from '../../lib/useAsync';
import { useAction } from '../../lib/useAction';
import { feedbackService } from '../../services/lifecycleServices';
import { Badge, Button, PageHeader, ActionStatus, Select } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { DataTable } from '../../components/DataTable';
import { ResourceState } from '../../components/ResourceState';
import { DEMO_MODE } from '../../config/runtime';
export function FeedbackReviewPage() {
  const { organization } = useOrganization();
  const id = organization!.id;
  const result = useAsync(useCallback(() => feedbackService.list(id), [id]));
  const [selected, setSelected] = useState<Feedback | null>(null);
  const action = useAction();
  return (
    <>
      <PageHeader
        title="Listen, learn, and follow through."
        eyebrow="Organization feedback"
        description="Review feedback related to this organization. Private account feedback remains outside the organization workspace."
      />
      <ResourceState result={result}>
        {(feedback) => (
          <DataTable
            caption="Organization feedback"
            rows={feedback}
            columns={[
              { key: 'category', label: 'Category', render: (item) => <Badge>{item.category}</Badge> },
              {
                key: 'message',
                label: 'Feedback',
                render: (item) => (
                  <Button variant="quiet" onClick={() => setSelected(item)}>
                    {item.message.length > 65 ? `${item.message.slice(0, 65)}…` : item.message}
                  </Button>
                ),
              },
              { key: 'screen', label: 'Screen', render: (item) => item.currentScreen },
              { key: 'status', label: 'Status', render: (item) => <Badge>{item.status}</Badge> },
            ]}
            emptyTitle="No feedback to review"
          />
        )}
      </ResourceState>
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Feedback detail">
        {selected && (
          <>
            <p className="break-word">{selected.message}</p>
            <dl className="key-value">
              <dt>Category</dt>
              <dd>{selected.category}</dd>
              <dt>Current screen</dt>
              <dd>{selected.currentScreen}</dd>
              <dt>App version</dt>
              <dd>{selected.appVersion}</dd>
              <dt>Attachment</dt>
              <dd>
                {selected.attachmentStoragePath
                  ? 'Secure attachment access pending'
                  : selected.attachmentName
                    ? `${selected.attachmentName} (not uploaded)`
                    : 'None'}
              </dd>
              <dt>Optional metadata</dt>
              <dd>{selected.deviceMetadata?.viewport ?? 'Not included'}</dd>
            </dl>
            <div className="section">
              <Select
                label="Review status"
                value={selected.status}
                onChange={(event) =>
                  setSelected({ ...selected, status: event.target.value as Feedback['status'] })
                }
              >
                <option value="new">New</option>
                <option value="reviewing">Reviewing</option>
                <option value="resolved">Resolved</option>
              </Select>
              <Button
                disabled={action.working}
                onClick={() => {
                  void action.run(
                    async () => {
                      await feedbackService.save(id, { ...selected, updatedAt: new Date().toISOString() });
                      result.refresh();
                    },
                    DEMO_MODE ? 'Review state saved in demo memory.' : 'Review state saved.',
                  );
                }}
              >
                Save review state
              </Button>
              <ActionStatus {...action} />
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
