import {
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
  type PropsWithChildren,
} from 'react';
import { Link, NavLink, type LinkProps } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger' }) {
  return <button type={type} className={`button ${variant} ${className}`} {...props} />;
}
export function LinkButton({
  variant = 'primary',
  className = '',
  ...props
}: LinkProps & { variant?: 'primary' | 'secondary' | 'quiet' }) {
  return <Link className={`button ${variant} ${className}`} {...props} />;
}
export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function Badge({
  children,
  tone = 'neutral',
}: PropsWithChildren<{ tone?: 'neutral' | 'positive' | 'warning' }>) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 tabIndex={-1}>{title}</h1>
        {description && <p className="lede">{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}
export function Input({
  label,
  hint,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <input id={fieldId} aria-describedby={hint ? `${fieldId}-hint` : undefined} {...props} />
      {hint && <small id={`${fieldId}-hint`}>{hint}</small>}
    </div>
  );
}
export function Select({
  label,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <select id={fieldId} {...props}>
        {children}
      </select>
    </div>
  );
}
export function TextArea({
  label,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <textarea id={fieldId} rows={5} {...props} />
    </div>
  );
}
export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="checkbox">
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}
export function EmptyState({
  title,
  description,
  icon = 'experience',
  children,
}: PropsWithChildren<{ title: string; description: string; icon?: IconName }>) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
export function LoadingState({ label = 'Loading your workspace…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="notice error" role="alert">
      <strong>Unable to continue</strong>
      <p>{message}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function ActionStatus({ error, message }: { error: string | null; message: string | null }) {
  return (
    <>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="notice success" role="status">
          {message}
        </div>
      )}
    </>
  );
}
export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {name
        .split(' ')
        .map((word) => word[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()}
    </span>
  );
}
export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.to ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function Tabs({ items }: { items: { label: string; to: string }[] }) {
  return (
    <nav className="tabs" aria-label="Section navigation">
      {items.map((item) => (
        <NavLink end to={item.to} key={item.to}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
/** Native disclosure navigation, not an ARIA menu that would require custom arrow-key behavior. */
export function DropdownMenu({
  label,
  accessibleLabel,
  children,
}: PropsWithChildren<{ label: ReactNode; accessibleLabel?: string }>) {
  return (
    <details className="dropdown">
      <summary aria-label={accessibleLabel}>{label}</summary>
      <div
        className="dropdown-panel"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a,button'))
            event.currentTarget.closest('details')?.removeAttribute('open');
        }}
      >
        {children}
      </div>
    </details>
  );
}
export function SkeletonNote({ children }: PropsWithChildren) {
  return (
    <div className="notice subtle">
      <Icon name="lock" />
      <p>{children}</p>
    </div>
  );
}
export function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <Card className="metric">
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </Card>
  );
}
