import { Card, EmptyState, LinkButton, PageHeader } from '../components/ui';
export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Let’s find your next step." eyebrow="Page not found" />
      <Card>
        <EmptyState
          title="This page isn’t part of the journey"
          description="The link may have changed, or the page may not be available in this workspace."
        >
          <LinkButton to="/">Return to Nurture</LinkButton>
          <LinkButton variant="secondary" to="/help">
            Visit help
          </LinkButton>
        </EmptyState>
      </Card>
    </>
  );
}
