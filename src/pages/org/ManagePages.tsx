import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrganization } from '../../providers/OrganizationProvider';
import { useAuth } from '../../providers/AuthProvider';
import { organizationService, invitationService } from '../../services/organizationService';
import { useAsync } from '../../lib/useAsync';
import { useAction } from '../../lib/useAction';
import type { Organization, OrganizationInvitation } from '../../domain/identity';
import { rolePermissions, permissions } from '../../domain/permissions';
import { DEMO_MODE } from '../../config/runtime';
import {
  ActionStatus,
  Avatar,
  Badge,
  Button,
  Card,
  Input,
  LinkButton,
  PageHeader,
  Select,
  SkeletonNote,
  TextArea,
  Tabs,
} from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { ResourceState } from '../../components/ResourceState';
import { Icon } from '../../components/Icon';
export function MembersPage() {
  const org = useOrganization();
  const id = org.organization!.id;
  const result = useAsync(useCallback(() => organizationService.members(id), [id]));
  return (
    <>
      <PageHeader
        title="Members & access"
        description="Organization members have an account and an explicit role. Experience contacts are managed separately."
        actions={
          <LinkButton to={`/org/${id}/invitations/new`}>
            <Icon name="plus" />
            Invite a member
          </LinkButton>
        }
      />
      <Tabs
        items={[
          { label: 'Members', to: `/org/${id}/members` },
          { label: 'Invitations', to: `/org/${id}/invitations` },
          { label: 'Roles & permissions', to: `/org/${id}/roles` },
        ]}
      />
      <ResourceState result={result}>
        {(members) => (
          <DataTable
            caption="Organization members"
            rows={members}
            columns={[
              {
                key: 'member',
                label: 'Member',
                render: (member) => (
                  <div className="person">
                    <Avatar name={member.displayName} />
                    <strong>{member.displayName}</strong>
                  </div>
                ),
              },
              { key: 'role', label: 'Role', render: (member) => <Badge>{member.role}</Badge> },
              { key: 'status', label: 'Status', render: (member) => member.status },
              {
                key: 'joined',
                label: 'Joined',
                render: (member) =>
                  member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : 'Awaiting acceptance',
              },
            ]}
          />
        )}
      </ResourceState>
      <SkeletonNote>
        Role changes, member suspension, and ownership transfer require a verified server action and an audit
        record. Members cannot assign themselves privileges.
      </SkeletonNote>
    </>
  );
}
export function InvitationsPage() {
  const org = useOrganization();
  const id = org.organization!.id;
  const base = `/org/${id}/invitations`;
  const result = useAsync(useCallback(() => invitationService.list(id), [id]));
  const [status, setStatus] = useState('all');
  return (
    <>
      <PageHeader
        title="Organization invitations"
        description="Connect an email recipient to registration or sign-in, verified acceptance, and an explicit organization membership."
        actions={<LinkButton to={`${base}/new`}>Invite a user</LinkButton>}
      />
      <Tabs
        items={[
          { label: 'Members', to: `/org/${id}/members` },
          { label: 'Invitations', to: base },
          { label: 'Roles & permissions', to: `/org/${id}/roles` },
        ]}
      />
      <div className="toolbar">
        <Select label="Invitation status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All invitations</option>
          <option value="pending">Pending acceptance</option>
          <option value="draft">Drafts, not sent</option>
          <option value="accepted">Accepted</option>
          <option value="expired">Expired</option>
        </Select>
      </div>
      <ResourceState result={result}>
        {(invitations) => (
          <DataTable
            caption="Organization invitations"
            rows={invitations.filter((invitation) => status === 'all' || invitation.status === status)}
            columns={[
              { key: 'email', label: 'Recipient', render: (invitation) => invitation.email },
              { key: 'role', label: 'Requested role', render: (invitation) => invitation.role },
              {
                key: 'status',
                label: 'Status',
                render: (invitation) => (
                  <Badge tone={invitation.status === 'pending' ? 'warning' : 'neutral'}>
                    {invitation.status}
                  </Badge>
                ),
              },
              {
                key: 'expires',
                label: 'Expires',
                render: (invitation) => new Date(invitation.expiresAt).toLocaleDateString(),
              },
              {
                key: 'review',
                label: 'Review',
                render: (invitation) =>
                  DEMO_MODE && invitation.id === 'demo-invite' ? (
                    <Link to="/invite/demo-invite">Demo acceptance</Link>
                  ) : (
                    <small>Token not issued</small>
                  ),
              },
            ]}
            emptyTitle="No invitations in this view"
          />
        )}
      </ResourceState>
    </>
  );
}
export function InviteUserPage() {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const action = useAction();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationInvitation['role']>('member');
  return (
    <div className="form-narrow">
      <PageHeader
        title="Invite someone to your organization"
        description="Choose only the access this person needs. The recipient must verify their identity before membership is granted."
      />
      <Card>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(
              async () => {
                const now = new Date();
                await invitationService.save(organization!.id, {
                  id: crypto.randomUUID(),
                  organizationId: organization!.id,
                  email: email.trim().toLowerCase(),
                  role,
                  invitedBy: user!.uid,
                  status: 'draft',
                  createdAt: now.toISOString(),
                  updatedAt: now.toISOString(),
                  expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
                });
              },
              DEMO_MODE
                ? 'Draft invitation saved in demo memory. No email was sent and no membership was created.'
                : 'Invitation draft saved.',
            );
          }}
        >
          <Input
            label="Recipient email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
          />
          <Select
            label="Organization role"
            value={role}
            onChange={(event) => setRole(event.target.value as OrganizationInvitation['role'])}
          >
            <option value="member">Member · personal experience only</option>
            <option value="manager">Manager · experiences & outreach</option>
            <option value="administrator">Administrator · organization management</option>
          </Select>
          <SkeletonNote>
            Delivery remains a SendGrid service stub. A future Cloud Function must issue a single-use token,
            verify the recipient’s email, check expiration, and atomically create membership.
          </SkeletonNote>
          <div className="actions">
            <Button type="submit" disabled={action.working}>
              Save draft invitation
            </Button>
            <LinkButton variant="quiet" to={`/org/${organization!.id}/invitations`}>
              View invitations
            </LinkButton>
          </div>
          <ActionStatus {...action} />
        </form>
      </Card>
    </div>
  );
}
export function RolesPage() {
  const { organization } = useOrganization();
  const rows = permissions.map((permission) => ({ id: permission, permission }));
  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="An explicit permission map powers navigation. Firebase Security Rules and trusted server functions enforce the same tenant boundaries."
      />
      <DataTable
        caption="Organization role permission matrix"
        rows={rows}
        columns={[
          { key: 'permission', label: 'Capability', render: (row) => row.permission.replace(':', ' · ') },
          ...(['owner', 'administrator', 'manager', 'member'] as const).map((role) => ({
            key: role,
            label: role.charAt(0).toUpperCase() + role.slice(1),
            render: (row: (typeof rows)[number]) =>
              rolePermissions[role].includes(row.permission) ? 'Allowed' : 'Not allowed',
          })),
        ]}
      />
      <SkeletonNote>
        New roles require a reviewed permission definition and matching server/rules tests. Owner transfer is
        a separate protected workflow; the browser cannot alter this permission map.
      </SkeletonNote>
      <LinkButton variant="secondary" to={`/org/${organization!.id}/members`}>
        Back to members
      </LinkButton>
    </>
  );
}
export function OrganizationProfilePage({ settings = false }: { settings?: boolean }) {
  const org = useOrganization();
  return (
    <>
      <PageHeader
        title={settings ? 'Organization settings' : 'Organization profile'}
        description={
          settings
            ? 'Defaults for responsible communication and organization administration.'
            : 'The identity participants see when they connect with your organization.'
        }
      />
      <OrganizationEditor
        key={`${org.organization!.id}-${settings}`}
        organization={org.organization!}
        settings={settings}
        onSaved={org.refresh}
      />
    </>
  );
}
function OrganizationEditor({
  organization,
  settings,
  onSaved,
}: {
  organization: Organization;
  settings: boolean;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(organization);
  const action = useAction();
  return (
    <Card className="form-narrow">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(
            async () => {
              if (!value.name.trim()) throw new Error('Add an organization name.');
              try {
                new Intl.DateTimeFormat('en', { timeZone: value.settings.timeZone });
              } catch {
                throw new Error('Enter a valid IANA time zone.');
              }
              await organizationService.save({ ...value, updatedAt: new Date().toISOString() });
              onSaved();
            },
            DEMO_MODE ? 'Organization settings saved in demo memory.' : 'Organization saved.',
          );
        }}
      >
        {settings ? (
          <>
            <Input
              label="Organization time zone"
              value={value.settings.timeZone}
              onChange={(event) =>
                setValue({ ...value, settings: { ...value.settings, timeZone: event.target.value } })
              }
              hint="For example, America/New_York. Future delivery uses the recipient’s known time zone with an explicit fallback."
              required
            />
            <div className="form-grid">
              <Input
                label="Quiet hours start"
                type="time"
                value={value.settings.quietHoursStart}
                onChange={(event) =>
                  setValue({ ...value, settings: { ...value.settings, quietHoursStart: event.target.value } })
                }
                required
              />
              <Input
                label="Quiet hours end"
                type="time"
                value={value.settings.quietHoursEnd}
                onChange={(event) =>
                  setValue({ ...value, settings: { ...value.settings, quietHoursEnd: event.target.value } })
                }
                required
              />
            </div>
            <Input
              label="Default daily contact limit"
              type="number"
              min={1}
              max={10}
              value={value.settings.dailyContactLimit}
              onChange={(event) =>
                setValue({
                  ...value,
                  settings: { ...value.settings, dailyContactLimit: Number(event.target.value) },
                })
              }
              required
            />
            <SkeletonNote>
              Sender identities, domain verification, suppression lists, audit logs, retention policies, data
              export, and organization deletion require protected backend implementation. No credentials
              belong in these settings.
            </SkeletonNote>
          </>
        ) : (
          <>
            <div className="person" style={{ marginBottom: 24 }}>
              <Avatar name={value.name} />
              <div>
                <strong>Organization identity</strong>
                <small>Logo upload is a future Storage workflow</small>
              </div>
            </div>
            <Input
              label="Organization name"
              value={value.name}
              maxLength={100}
              onChange={(event) => setValue({ ...value, name: event.target.value })}
              required
            />
            <Input
              label="Organization slug"
              value={value.slug}
              readOnly
              hint="Slug changes require server-side uniqueness checks."
            />
            <TextArea
              label="Description"
              value={value.description}
              onChange={(event) => setValue({ ...value, description: event.target.value })}
              maxLength={1500}
            />
            <Input
              label="Website (optional)"
              type="url"
              value={value.website}
              onChange={(event) => setValue({ ...value, website: event.target.value })}
              maxLength={500}
            />
          </>
        )}
        <Button type="submit" disabled={action.working}>
          Save {settings ? 'settings' : 'organization profile'}
        </Button>
        <ActionStatus {...action} />
      </form>
    </Card>
  );
}
