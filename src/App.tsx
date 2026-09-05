import { AppProviders } from "./app/providers/AppProviders";
import { AppRouter } from "./app/routing/AppRouter";
import { installAnalyticsCompatibilityBridges } from "./features/analytics";

installAnalyticsCompatibilityBridges();

export default function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
