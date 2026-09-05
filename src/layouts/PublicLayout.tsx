import { Link, NavLink, Outlet } from 'react-router-dom';
import { DEMO_MODE } from '../config/runtime';
import { publicNavigation, footerNavigation } from '../app/navigation';
import { DropdownMenu, LinkButton } from '../components/ui';
import { Icon } from '../components/Icon';
import { useAuth } from '../providers/AuthProvider';
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Nurture home">
      <Icon name="leaf" size={28} />
      <span>Nurture</span>
    </Link>
  );
}
export function PublicHeader() {
  const { status } = useAuth();
  return (
    <header className="public-header">
      <Brand />
      <nav aria-label="Main navigation" className="public-navigation">
        {publicNavigation.map((item) => (
          <NavLink key={item.path} to={item.path}>
            {item.label}
          </NavLink>
        ))}
        <DropdownMenu
          label={
            <>
              <span>Explore</span>
              <Icon name="chevron" size={15} />
            </>
          }
        >
          {footerNavigation.map((group) => (
            <div key={group.heading}>
              <h3>{group.heading}</h3>
              {group.links.map((item) => (
                <Link key={item.path} to={item.path}>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
          {DEMO_MODE && <Link to="/demo">Demo guide</Link>}
        </DropdownMenu>
      </nav>
      <div className="header-actions">
        <LinkButton variant="quiet" to={status === 'authenticated' ? '/app' : '/login'}>
          {status === 'authenticated' ? 'Open app' : 'Sign in'}
        </LinkButton>
        <LinkButton to="/experience">
          Get started
          <Icon name="arrow" size={16} />
        </LinkButton>
      </div>
    </header>
  );
}
export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="footer-top">
        <div>
          <Brand />
          <p>
            A place for experiences.
            <br />A foundation for lasting connections.
          </p>
        </div>
        {footerNavigation.map((group) => (
          <nav className="footer-group" aria-label={`${group.heading} footer links`} key={group.heading}>
            <h2>{group.heading}</h2>
            {group.links.map((item) => (
              <Link to={item.path} key={item.path}>
                {item.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Nurture</span>
        <span>Thoughtfully connected.</span>
        {DEMO_MODE && <Link to="/demo">Demo guide</Link>}
      </div>
    </footer>
  );
}
export function DemoBanner() {
  return DEMO_MODE ? (
    <div className="demo-banner">
      <span>
        <strong>Demo workspace</strong> · Fictional sample data. Changes reset on refresh. No messages or
        payments.
      </span>
      <Link to="/demo">Review guide</Link>
    </div>
  ) : null;
}
export default function PublicLayout() {
  return (
    <>
      <PublicHeader />
      <DemoBanner />
      <main id="main-content" className="public-main">
        <Outlet />
      </main>
      <PublicFooter />
    </>
  );
}
