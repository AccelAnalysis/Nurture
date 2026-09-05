import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEMO_ORG_ID } from "../../data/demo";
import {
  CONFIGURATION_CHANGED_EVENT,
  configurationStore,
  type ConfigurationStore,
} from "./store";
import type { OrganizationConfiguration, OrganizationConfigurationRecord } from "./types";

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
  saveDraft: (organizationId: string, effective: OrganizationConfiguration) => OrganizationConfigurationRecord;
  resetDraft: (organizationId: string) => OrganizationConfigurationRecord;
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
  const saveDraft = useCallback((organizationId: string, effective: OrganizationConfiguration) => store.saveDraft(organizationId, effective), [store]);
  const resetDraft = useCallback((organizationId: string) => store.resetDraft(organizationId), [store]);
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
    saveDraft,
    resetDraft,
    publish,
  }), [getDraft, getPublished, getRecord, publicConfiguration, publicOrganizationId, publish, resetDraft, saveDraft]);

  return <ConfigurationContext.Provider value={value}>{children}</ConfigurationContext.Provider>;
}

export function useConfiguration() {
  const value = useContext(ConfigurationContext);
  if (!value) throw new Error("useConfiguration must be used inside ConfigurationProvider.");
  return value;
}
