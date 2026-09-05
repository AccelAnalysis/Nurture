import type { IconName } from '../components/Icon';
import type { Permission } from '../domain/permissions';
export interface NavigationItem {
  label: string;
  path: string;
  icon: IconName;
  permission?: Permission;
  group?: string;
}
export const publicNavigation = [
  { label: 'Features', path: '/features' },
  { label: 'How it works', path: '/how-it-works' },
  { label: 'Offers', path: '/offers' },
];
export const footerNavigation = [
  {
    heading: 'Explore',
    links: [
      { label: 'Home', path: '/' },
      ...publicNavigation,
      { label: 'Try an experience', path: '/experience' },
    ],
  },
  {
    heading: 'Nurture',
    links: [
      { label: 'About', path: '/about' },
      { label: 'Help & FAQ', path: '/help' },
      { label: 'Contact', path: '/contact' },
    ],
  },
  {
    heading: 'Your account',
    links: [
      { label: 'Sign in', path: '/login' },
      { label: 'Create account', path: '/register' },
      { label: 'Create organization', path: '/organizations/new' },
    ],
  },
  {
    heading: 'Trust',
    links: [
      { label: 'Privacy', path: '/privacy' },
      { label: 'Terms', path: '/terms' },
      { label: 'Accessibility', path: '/accessibility' },
      { label: 'Communication preferences', path: '/preferences' },
    ],
  },
];
export const customerNavigation: NavigationItem[] = [
  { label: 'Home', path: '/app', icon: 'home', group: 'Your experience' },
  { label: 'App experience', path: '/app/experience', icon: 'experience' },
  { label: 'Secondary experience', path: '/app/secondary', icon: 'layers' },
  { label: 'Offers & upgrade', path: '/app/offers', icon: 'offers' },
  { label: 'Notifications', path: '/app/notifications', icon: 'bell', group: 'Stay connected' },
  { label: 'Feedback', path: '/app/feedback', icon: 'feedback' },
  { label: 'Referrals', path: '/app/referrals', icon: 'share' },
  { label: 'Profile', path: '/app/profile', icon: 'user', group: 'You' },
  { label: 'Account', path: '/app/account', icon: 'building' },
  { label: 'Settings', path: '/app/settings', icon: 'settings' },
  { label: 'Billing', path: '/app/billing', icon: 'billing' },
  { label: 'Help', path: '/app/help', icon: 'help' },
];
export const organizationNavigation: NavigationItem[] = [
  { label: 'Overview', path: '', icon: 'home', permission: 'workspace:view', group: 'Workspace' },
  { label: 'Dashboard', path: 'dashboard', icon: 'chart', permission: 'workspace:view' },
  {
    label: 'Experience contacts',
    path: 'contacts',
    icon: 'people',
    permission: 'people:manage',
    group: 'Customer journey',
  },
  { label: 'Customer lifecycle', path: 'lifecycle', icon: 'flow', permission: 'people:manage' },
  { label: 'Contact sequences', path: 'sequences', icon: 'flow', permission: 'outreach:manage' },
  { label: 'Message templates', path: 'templates', icon: 'mail', permission: 'outreach:manage' },
  { label: 'Survey templates', path: 'surveys', icon: 'feedback', permission: 'surveys:manage' },
  { label: 'Offers', path: 'offers', icon: 'offers', permission: 'offers:manage' },
  { label: 'Referral program', path: 'referrals', icon: 'share', permission: 'organization:manage' },
  { label: 'Feedback review', path: 'feedback', icon: 'feedback', permission: 'feedback:review' },
  { label: 'Analytics', path: 'analytics', icon: 'chart', permission: 'insights:view' },
  {
    label: 'Organization profile',
    path: 'profile',
    icon: 'building',
    permission: 'organization:manage',
    group: 'Organization',
  },
  { label: 'Members', path: 'members', icon: 'people', permission: 'members:manage' },
  { label: 'Invitations', path: 'invitations', icon: 'mail', permission: 'members:manage' },
  { label: 'Roles & permissions', path: 'roles', icon: 'lock', permission: 'members:manage' },
  { label: 'Billing', path: 'billing', icon: 'billing', permission: 'billing:manage' },
  { label: 'Settings', path: 'settings', icon: 'settings', permission: 'organization:manage' },
];
