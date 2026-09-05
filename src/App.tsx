import { AppProviders } from "./app/providers/AppProviders";
import { AppRouter } from "./app/routing/AppRouter";

export default function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
