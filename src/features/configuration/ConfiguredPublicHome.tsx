import { EmptyState } from "../../components/ui";
import { useConfiguration } from "./ConfigurationProvider";
import { ConfiguredMarketingHome } from "./PublicSite";

export function ConfiguredPublicHome() {
  const { publicConfiguration } = useConfiguration();
  if (!publicConfiguration) {
    return (
      <section className="content-width page-section">
        <EmptyState title="Application unavailable" description="No approved published organization configuration could be resolved for this host." />
      </section>
    );
  }
  return <ConfiguredMarketingHome configuration={publicConfiguration} />;
}
