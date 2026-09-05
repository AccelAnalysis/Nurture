import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEMO_ORG_ID } from "../../data/demo";
import {
  CONFIGURATION_CHANGED_EVENT,
  configurationStore,
  type ConfigurationStore,
} from "./store";
import type {
  ConfigurationExtension,
  OrganizationConfiguration,
  OrganizationConfigurationRecord,
  PublishedConfigurationExtension,
} from "./types";

const APPROVED_PUBLIC_HOSTS: Record<string, string> = {
  "nurture.accelanalysis.com": DEMO_ORG_ID,
  "nurture-12398.web.app": DEMO_ORG_ID,
  "nurture-12398.firebaseapp.com": DEMO_ORG_ID,
  localhost: DEMO_ORG_ID,
  "127.0.0.1": DEMO_ORG_ID,
};

export function resolvePublicOrganizationId(hostname: string) {
  return APPROVED_PUBLIC_HOSTS[hostname.toLowerCase()] ?? null;
}

interface ConfigurationContextValue {
  publicOrganizationId: string | null;
  publicConfiguration: OrganizationConfiguration | null;
  getRecord: (organizationId: string) => OrganizationConfigurationRecord;
  getDraft: (organizationId: string) => OrganizationConfiguration;
  getPublished: (organizationId: string) => OrganizationConfiguration;
  getDraftExtension: (organizationId: string, extensionKey: string) => ConfigurationExtension | null;
  getPublishedExtension: (organizationId: string, extensionKey: string) => PublishedConfigurationExtension | null;
  saveDraft: (organizationId: string, effective: OrganizationConfiguration) => OrganizationConfigurationRecord;
  saveDraftExtension: (organizationId: string, extensionKey: string, extension: ConfigurationExtension) => OrganizationConfigurationRecord;
  removeDraftExtension: (organizationId: string, extensionKey: string) => OrganizationConfigurationRecord;
  resetDraft: (organizationId: string) => OrganizationConfigurationRecord;
  resetAllDraft: (organizationId: string) => OrganizationConfigurationRecord;
  publish: (organizationId: string, publishedBy?: string) => OrganizationConfigurationRecord;
}

const ConfigurationContext = createContext<ConfigurationContextValue | null>(null);

export function ConfigurationProvider({
  children,
  store = configurationStore,
}: {
  children: ReactNode;
  store?: ConfigurationStore;
}) {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(CONFIGURATION_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CONFIGURATION_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const publicOrganizationId = useMemo(
    () => resolvePublicOrganizationId(window.location.hostname),
    [],
  );

  const getRecord = useCallback((organizationId: string) => store.getRecord(organizationId), [store, revision]);
  const getDraft = useCallback((organizationId: string) => store.getDraft(organizationId), [store, revision]);
  const getPublished = useCallback((organizationId: string) => store.getPublished(organizationId), [store, revision]);
  const getDraftExtension = useCallback((organizationId: string, extensionKey: string) => store.getDraftExtension(organizationId, extensionKey), [store, revision]);
  const getPublishedExtension = useCallback((organizationId: string, extensionKey: string) => store.getPublishedExtension(organizationId, extensionKey), [store, revision]);
  const saveDraft = useCallback((organizationId: string, effective: OrganizationConfiguration) => store.saveDraft(organizationId, effective), [store]);
  const saveDraftExtension = useCallback((organizationId: string, extensionKey: string, extension: ConfigurationExtension) => store.saveDraftExtension(organizationId, extensionKey, extension), [store]);
  const removeDraftExtension = useCallback((organizationId: string, extensionKey: string) => store.removeDraftExtension(organizationId, extensionKey), [store]);
  const resetDraft = useCallback((organizationId: string) => store.resetDraft(organizationId), [store]);
  const resetAllDraft = useCallback((organizationId: string) => store.resetAllDraft(organizationId), [store]);
  const publish = useCallback((organizationId: string, publishedBy?: string) => store.publish(organizationId, publishedBy), [store]);

  const publicConfiguration = useMemo(
    () => publicOrganizationId ? store.getPublished(publicOrganizationId) : null,
    [publicOrganizationId, revision, store],
  );

  const value = useMemo<ConfigurationContextValue>(() => ({
    publicOrganizationId,
    publicConfiguration,
    getRecord,
    getDraft,
    getPublished,
    getDraftExtension,
    getPublishedExtension,
    saveDraft,
    saveDraftExtension,
    removeDraftExtension,
    resetDraft,
    resetAllDraft,
    publish,
  }), [
    getDraft,
    getDraftExtension,
    getPublished,
    getPublishedExtension,
    getRecord,
    publicConfiguration,
    publicOrganizationId,
    publish,
    removeDraftExtension,
    resetAllDraft,
    resetDraft,
    saveDraft,
    saveDraftExtension,
  ]);

  return <ConfigurationContext.Provider value={value}>{children}</ConfigurationContext.Provider>;
}

export function useConfiguration() {
  const value = useContext(ConfigurationContext);
  if (!value) throw new Error("useConfiguration must be used inside ConfigurationProvider.");
  return value;
}

/**
 * Public feature owners (for example Track D) use this render boundary so the
 * approved host mapping remains single-source in Track A and unknown hosts stay fail-closed.
 */
export function PublicOrganizationScope({ children }: { children: (organizationId: string) => ReactNode }) {
  const { publicOrganizationId } = useConfiguration();
  return publicOrganizationId ? <>{children(publicOrganizationId)}</> : null;
}
