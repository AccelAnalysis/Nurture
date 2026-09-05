import { AppProviders } from "./app/providers/AppProviders";
import { installRelease2BackendPorts } from "./app/release/installRelease2Backend";
import { AppRouter } from "./app/routing/AppRouter";
import { installAnalyticsCompatibilityBridges } from "./features/analytics";

installAnalyticsCompatibilityBridges();
installRelease2BackendPorts();

export default function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
