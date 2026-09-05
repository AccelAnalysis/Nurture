import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { customerNavigation, organizationNavigation, type NavigationItem } from '../app/navigation';
import { Avatar, Button, DropdownMenu, Select } from '../components/ui';
import { Icon } from '../components/Icon';
import { FeedbackForm } from '../components/FeedbackForm';
import { Modal } from '../components/Modal';
import { Brand, DemoBanner } from './PublicLayout';
import { useOrganization } from '../providers/OrganizationProvider';
import { useAuth } from '../providers/AuthProvider';
import { useNotifications } from '../providers/NotificationProvider';
import { authService } from '../services/authService';
import { errorMessage } from '../lib/errors';
function NavigationLinks({ items, onSelect }: { items: NavigationItem[]; onSelect?: () => void }) {
  return (
    <>
      {items.map((item) => (
        <div key={item.path}>
          {item.group && <p className="nav-group">{item.group}</p>}
          <NavLink
            end={item.path === '/app' || /^\/org\/[^/]+$/.test(item.path)}
            to={item.path}
            onClick={onSelect}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        </div>
      ))}
    </>
  );
}
export function Sidebar({ items }: { items: NavigationItem[] }) {
  return (
    <aside className="sidebar">
      <nav aria-label="Workspace navigation">
        <NavigationLinks items={items} />
      </nav>
      <div className="sidebar-foot">
        <Icon name="leaf" />
        <span>
          Make the next
          <br />
          <strong>connection count.</strong>
        </span>
      </div>
    </aside>
  );
}
export function MobileNavigation({
  organization,
  openMenu,
}: {
  organization: boolean;
  openMenu: () => void;
}) {
  const org = useOrganization();
  const base = `/org/${org.organization?.id}`;
  const items = organization
    ? [
        { label: 'Overview', path: base, icon: 'home' as const },
        { label: 'People', path: `${base}/contacts`, icon: 'people' as const },
        { label: 'Sequences', path: `${base}/sequences`, icon: 'flow' as const },
      ]
    : [
        { label: 'Home', path: '/app', icon: 'home' as const },
        { label: 'Experience', path: '/app/experience', icon: 'experience' as const },
        { label: 'Inbox', path: '/app/notifications', icon: 'bell' as const },
      ];
  return (
    <nav className="mobile-navigation" aria-label="Mobile navigation">
      {items.map((item) => (
        <NavLink end to={item.path} key={item.path}>
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </NavLink>
      ))}
      <Button variant="quiet" onClick={openMenu}>
        <Icon name="menu" />
        <span>More</span>
      </Button>
    </nav>
  );
}
export default function AppShell({ organization = false }: { organization?: boolean }) {
  const org = useOrganization();
  const { user } = useAuth();
  const { notifications } = useNotifications();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = organization
    ? organizationNavigation
        .filter((item) => item.permission && org.permits(item.permission))
        .map((item) => ({ ...item, path: `/org/${org.organization?.id}${item.path ? `/${item.path}` : ''}` }))
    : customerNavigation;
  async function leave() {
    try {
      await authService.signOut();
      navigate('/');
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }
  return (
    <div className="application">
      <header className="app-header">
        <Brand />
        <div className="workspace-label">
          <span className="workspace-divider" />
          {organization ? org.organization?.name : 'Your Nurture'}
        </div>
        <div className="header-actions">
          {org.permits('workspace:view') && (
            <Link
              className="workspace-switch"
              to={organization ? '/app' : `/org/${org.organization?.id}`}
              aria-label={organization ? 'My app' : 'Organization'}
            >
              <Icon name={organization ? 'user' : 'building'} />
              <span>{organization ? 'My app' : 'Organization'}</span>
            </Link>
          )}
          <Link
            className="icon-link"
            to="/app/notifications"
            aria-label={`Notifications, ${notifications.filter((item) => !item.readAt).length} unread`}
          >
            <Icon name="bell" />
          </Link>
          <Button
            className="feedback-shortcut"
            variant="quiet"
            aria-label="Share feedback"
            onClick={() => setFeedbackOpen(true)}
          >
            <Icon name="feedback" />
          </Button>
          <DropdownMenu accessibleLabel="Account menu" label={<Avatar name={user?.displayName ?? 'You'} />}>
            <Link to="/app/profile">Your profile</Link>
            <Link to="/app/account">Account & organizations</Link>
            <Link to="/app/settings">Settings</Link>
            <Link to="/">Public website</Link>
            <Button variant="quiet" onClick={leave}>
              <Icon name="logout" />
              Sign out
            </Button>
          </DropdownMenu>
        </div>
      </header>
      <DemoBanner />
      <div className="workspace">
        <Sidebar items={items} />
        <main id="main-content" className="workspace-main">
          {error && (
            <div role="alert" className="notice error">
              {error}
            </div>
          )}
          {organization && org.memberships.length > 1 && (
            <div className="organization-switcher">
              <Select
                label="Current organization"
                value={org.organization?.id}
                onChange={(event) => navigate(`/org/${event.target.value}`)}
              >
                {org.memberships.map((member) => (
                  <option key={member.organizationId} value={member.organizationId}>
                    {member.organizationId}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <Outlet />
          <footer className="workspace-footer">
            <span>Nurture · {organization ? 'Organization workspace' : 'Your experience hub'}</span>
            <Link to="/app/feedback">Share feedback</Link>
          </footer>
        </main>
      </div>
      <Modal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} title="Share your perspective">
        <FeedbackForm />
      </Modal>
      <MobileNavigation organization={organization} openMenu={() => setMenuOpen(true)} />
      <Modal
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={organization ? 'Organization navigation' : 'Your Nurture'}
      >
        <nav className="mobile-menu" aria-label="All app destinations">
          <NavigationLinks items={items} onSelect={() => setMenuOpen(false)} />
          <Button variant="quiet" onClick={leave}>
            <Icon name="logout" />
            Sign out
          </Button>
        </nav>
      </Modal>
    </div>
  );
}
