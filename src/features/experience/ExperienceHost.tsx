import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import { Badge, Button, EmptyState, LoadingState, PageHeader } from "../../components/ui";
import { useOrganization } from "../../context/OrganizationContext";
import { Link, navigate } from "../../router";
import { useAuth } from "../identity/auth";
import { ParticipantStateView } from "../participant/ParticipantStateView";
import { resolveExperienceCapability } from "./access";
import type {
  EntitlementSnapshotResult,
  Experience,
  ExperienceAccessMode,
  ExperienceCustomerResult,
  ExperienceLifecycleEvent,
  ExperienceModule,
  ExperienceModuleRenderContext,
  ExperienceSlot,
  JsonObject,
} from "./contracts";
import { SharedExperienceMedia } from "./media";
import { createRegisteredExperience, getExperienceRegistration, validateExperienceConfiguration } from "./registry";
import { createExperienceEventId, useExperienceRuntime } from "./runtime";
import "./experience.css";

interface ExperienceHostProps {
  slot: ExperienceSlot;
  accessMode: ExperienceAccessMode;
  relativePath?: string;
}

interface ExperienceModuleBoundaryProps {
  children: ReactNode;
  onError: (error: Error) => void;
}

interface ExperienceModuleBoundaryState {
  error: Error | null;
}

class ExperienceModuleBoundary extends Component<ExperienceModuleBoundaryProps, ExperienceModuleBoundaryState> {
  state: ExperienceModuleBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ExperienceModuleBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(error);
  }

  render() {
    if (this.state.error) {
      return <ParticipantStateView state="error" description="This Experience stopped unexpectedly. Account and billing controls remain available outside the module." />;
    }
    return this.props.children;
  }
}

type PublishedExperienceState =
  | "loading"
  | { status: "ready"; experience: Experience }
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string };

function normalizeRelativePath(path = "") {
  return path.replace(/^\/+|\/+$/g, "");
}

function basePath(slot: ExperienceSlot, accessMode: ExperienceAccessMode) {
  if (accessMode !== "authenticated") return "/experience";
  return slot === "primary" ? "/app/experience" : "/app/secondary";
}

function moduleHref(base: string, relativePath: string) {
  return relativePath ? `${base}/${relativePath}` : base;
}

export function ExperienceHost({ slot, accessMode, relativePath = "" }: ExperienceHostProps) {
  const registration = getExperienceRegistration(slot);
  const { currentUser } = useAuth();
  const { currentOrganizationId } = useOrganization();
  const runtime = useExperienceRuntime();
  const [module, setModule] = useState<ExperienceModule | null>(null);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [publishedExperience, setPublishedExperience] = useState<PublishedExperienceState>("loading");
  const [customerResult, setCustomerResult] = useState<ExperienceCustomerResult | "loading">("loading");
  const [entitlementResult, setEntitlementResult] = useState<EntitlementSnapshotResult | "loading">("loading");
  const normalizedPath = normalizeRelativePath(relativePath);
  const authenticated = accessMode === "authenticated" && Boolean(currentUser);
  const organizationId = accessMode === "authenticated" ? currentOrganizationId ?? undefined : undefined;
  const experience = publishedExperience !== "loading" && publishedExperience.status === "ready"
    ? publishedExperience.experience
    : null;
  const customerId = customerResult !== "loading" && customerResult.status === "ready"
    ? customerResult.customerId
    : undefined;

  const locale = useMemo(() => navigator.language || "en-US", []);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  useEffect(() => {
    let cancelled = false;
    setModule(null);
    setModuleError(null);
    if (!registration) return;
    registration.loader()
      .then((loaded) => {
        if (cancelled) return;
        if (loaded.manifest.id !== registration.id || loaded.manifest.version !== registration.moduleVersion) {
          throw new Error(`Experience registration mismatch for ${registration.id}.`);
        }
        setModule(loaded);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setModuleError(reason instanceof Error ? reason.message : "The Experience module could not be loaded.");
      });
    return () => { cancelled = true; };
  }, [registration]);

  useEffect(() => {
    let cancelled = false;
    if (!registration) {
      setPublishedExperience({ status: "unavailable", reason: `No trusted Experience module is registered for the ${slot} slot.` });
      return;
    }

    if (!runtime.definitionSource) {
      setPublishedExperience({ status: "ready", experience: createRegisteredExperience(registration, organizationId ?? null) });
      return;
    }

    setPublishedExperience("loading");
    runtime.definitionSource.loadPublishedExperience({
      organizationId,
      slot,
      moduleId: registration.id,
      moduleVersion: registration.moduleVersion,
    }).then((loaded) => {
      if (cancelled) return;
      if (!loaded) {
        setPublishedExperience({ status: "unavailable", reason: "No published Experience configuration is available for this scope." });
        return;
      }
      if (loaded.slot !== slot || loaded.moduleId !== registration.id || loaded.moduleVersion !== registration.moduleVersion) {
        setPublishedExperience({ status: "error", reason: "The published Experience does not match the trusted module registration." });
        return;
      }
      if (organizationId && loaded.organizationId !== organizationId) {
        setPublishedExperience({ status: "error", reason: "The published Experience belongs to a different organization scope." });
        return;
      }
      if (loaded.status !== "published") {
        setPublishedExperience({ status: "unavailable", reason: "This Experience is not currently published." });
        return;
      }
      setPublishedExperience({ status: "ready", experience: loaded });
    }).catch((reason: unknown) => {
      if (!cancelled) setPublishedExperience({
        status: "error",
        reason: reason instanceof Error ? reason.message : "Published Experience configuration could not be loaded.",
      });
    });
    return () => { cancelled = true; };
  }, [organizationId, registration, runtime.definitionSource, slot]);

  useEffect(() => {
    let cancelled = false;
    if (!currentUser || accessMode !== "authenticated") {
      setCustomerResult({ status: "unavailable", reason: "No authenticated customer context is expected in this access mode." });
      return;
    }
    setCustomerResult("loading");
    runtime.customerSource.resolveCustomer({
      organizationId,
      identityId: currentUser.uid,
    }).then((result) => {
      if (!cancelled) setCustomerResult(result);
    }).catch((reason: unknown) => {
      if (!cancelled) setCustomerResult({
        status: "unavailable",
        reason: reason instanceof Error ? reason.message : "Customer/profile identity could not be resolved.",
      });
    });
    return () => { cancelled = true; };
  }, [accessMode, currentUser, organizationId, runtime.customerSource]);

  useEffect(() => {
    let cancelled = false;
    if (!experience || !currentUser || accessMode !== "authenticated") {
      setEntitlementResult({ status: "unavailable", reason: "No authenticated customer entitlement context is available in this access mode." });
      return;
    }
    if (customerResult === "loading") {
      setEntitlementResult("loading");
      return;
    }
    if (customerResult.status !== "ready") {
      setEntitlementResult({ status: "unavailable", reason: "Trusted Customer resolution is required before entitlement lookup." });
      return;
    }

    setEntitlementResult("loading");
    runtime.entitlementSource.loadPresentationSnapshot({
      organizationId,
      identityId: currentUser.uid,
      customerId: customerResult.customerId,
      experienceId: experience.id,
      moduleId: experience.moduleId,
    }).then((result) => {
      if (!cancelled) setEntitlementResult(result);
    }).catch((reason: unknown) => {
      if (!cancelled) setEntitlementResult({
        status: "unavailable",
        reason: reason instanceof Error ? reason.message : "Trusted entitlement state could not be loaded.",
      });
    });
    return () => { cancelled = true; };
  }, [accessMode, currentUser, customerResult, experience, organizationId, runtime.entitlementSource]);

  const trustedSnapshot = entitlementResult !== "loading" && entitlementResult.status === "ready"
    ? entitlementResult.snapshot
    : undefined;

  const submitHostEvent = (eventType: string, properties: JsonObject = {}, idempotencyKey?: string) => {
    if (!experience || !module) return;
    const event: ExperienceLifecycleEvent = {
      eventId: createExperienceEventId(),
      eventType,
      occurredAt: new Date().toISOString(),
      source: "experience-browser",
      trust: "browser-observed",
      schemaVersion: 1,
      organizationId,
      identityId: currentUser?.uid,
      customerId,
      experienceId: experience.id,
      moduleId: module.manifest.id,
      moduleVersion: module.manifest.version,
      idempotencyKey,
      properties,
    };
    void runtime.eventSink.submit(event);
  };

  useEffect(() => {
    if (!module || !experience) return;
    const event: ExperienceLifecycleEvent = {
      eventId: createExperienceEventId(),
      eventType: "experience.started",
      occurredAt: new Date().toISOString(),
      source: "experience-browser",
      trust: "browser-observed",
      schemaVersion: 1,
      organizationId,
      identityId: currentUser?.uid,
      customerId,
      experienceId: experience.id,
      moduleId: module.manifest.id,
      moduleVersion: module.manifest.version,
      properties: { accessMode, slot },
    };
    void runtime.eventSink.submit(event);
  }, [accessMode, currentUser?.uid, customerId, experience, module, organizationId, runtime.eventSink, slot]);

  if (!registration) {
    return <ParticipantStateView state="unavailable" title="Experience unavailable" description={`No trusted Experience module is registered for the ${slot} slot.`} />;
  }
  if (moduleError) return <ParticipantStateView state="error" description={moduleError} />;
  if (publishedExperience === "loading" || !module) return <LoadingState label="Loading Experience…" />;
  if (publishedExperience.status === "error") return <ParticipantStateView state="error" description={publishedExperience.reason} />;
  if (publishedExperience.status === "unavailable") {
    return <ParticipantStateView state="unavailable" title="Experience unavailable" description={publishedExperience.reason} />;
  }
  if (!experience) return <ParticipantStateView state="error" description="The Experience host could not resolve a published Experience." />;

  const configurationErrors = validateExperienceConfiguration(module.manifest, experience);
  if (configurationErrors.length > 0) {
    return <ParticipantStateView state="error" description={`Published Experience configuration is invalid: ${configurationErrors.join(" ")}`} />;
  }

  const route = module.manifest.routes.find((item) => normalizeRelativePath(item.path) === normalizedPath);
  if (!route) {
    return <ParticipantStateView state="unavailable" title="Experience destination unavailable" description="This module route is not registered by the active Experience." />;
  }

  const routeRequiresEntitlement = route.capability
    ? module.manifest.capabilities.find((capability) => capability.key === route.capability)?.requiresEntitlement === true
    : false;
  if (routeRequiresEntitlement && (customerResult === "loading" || entitlementResult === "loading")) {
    return <LoadingState label="Checking Experience access…" />;
  }

  const canUse = (capabilityKey: string) => resolveExperienceCapability({
    manifest: module.manifest,
    experience,
    capabilityKey,
    accessMode,
    authenticated,
    organizationId,
    customerId,
    snapshot: trustedSnapshot,
  });

  if (!route.access.includes(accessMode)) {
    const needsAuthentication = route.access.includes("authenticated") && accessMode !== "authenticated";
    return (
      <EmptyState
        title={needsAuthentication ? "Create an account to continue" : "Experience access is limited"}
        description={needsAuthentication ? "This module destination is available after authentication." : "This destination is not exposed in the current Experience mode."}
        action={needsAuthentication ? <Button onClick={() => {
          sessionStorage.setItem("nurture-experience-return-path", moduleHref(basePath(slot, "authenticated"), normalizedPath));
          navigate("/register");
        }}>Create account</Button> : undefined}
      />
    );
  }

  if (route.capability) {
    const decision = canUse(route.capability);
    if (!decision.allowed) {
      const authenticationRequired = decision.reason === "authentication-required";
      return (
        <EmptyState
          title={authenticationRequired ? "Create an account to continue" : "This capability is not available"}
          description={decision.explanation}
          action={authenticationRequired
            ? <Button onClick={() => {
                sessionStorage.setItem("nurture-experience-return-path", moduleHref(basePath(slot, "authenticated"), normalizedPath));
                navigate("/register");
              }}>Create account</Button>
            : <Link className="button" href={`${accessMode === "authenticated" ? "/app/offers" : "/offers"}?capability=${encodeURIComponent(route.capability)}`}>Review access options</Link>}
        />
      );
    }
  }

  const moduleBasePath = basePath(slot, accessMode);
  const navigation = module.manifest.navigation.filter((item) => item.access.includes(accessMode));
  const context: ExperienceModuleRenderContext = {
    experience,
    manifest: module.manifest,
    route,
    configuration: experience.configuration,
    accessMode,
    authenticated,
    locale,
    timeZone,
    organizationId,
    identityId: currentUser?.uid,
    customerId,
    canUse,
    requestRegistration(returnPath = moduleHref(basePath(slot, "authenticated"), normalizedPath)) {
      const safeReturnPath = returnPath.startsWith("/app/experience") || returnPath.startsWith("/app/secondary")
        ? returnPath
        : moduleHref(basePath(slot, "authenticated"), normalizedPath);
      sessionStorage.setItem("nurture-experience-return-path", safeReturnPath);
      navigate("/register");
    },
    requestUpgrade(capabilityKey) {
      const destination = accessMode === "authenticated" ? "/app/offers" : "/offers";
      navigate(`${destination}?capability=${encodeURIComponent(capabilityKey)}`);
    },
    submitEvent(name, properties = {}, idempotencyKey) {
      const definition = module.manifest.eventDefinitions.find((item) => item.name === name);
      if (!definition || definition.source !== "browser") return false;
      submitHostEvent(name, properties, idempotencyKey);
      return true;
    },
    completeOnboardingStep(stepId, result) {
      const declared = module.manifest.onboardingRequirements.some((item) => item.id === stepId);
      if (!declared) return Promise.resolve({ status: "unavailable", reason: "The module did not declare this onboarding step." });
      return runtime.onboardingBridge.completeStep({
        experienceId: experience.id,
        moduleId: module.manifest.id,
        stepId,
        result,
      });
    },
    renderMedia(asset) {
      return <SharedExperienceMedia asset={asset} />;
    },
    reportRecoverableError(code, safeContext) {
      void runtime.recoverableErrorReporter.report({
        code,
        experienceId: experience.id,
        moduleId: module.manifest.id,
        safeContext,
      });
    },
  };

  return (
    <section className="experience-host" aria-label={module.manifest.name}>
      <PageHeader
        eyebrow={`${slot === "primary" ? "Primary" : "Secondary"} Experience · ${accessMode}`}
        title={module.manifest.name}
        description={module.manifest.description}
        actions={<div className="experience-host-badges"><Badge tone="accent">Module {module.manifest.version}</Badge>{entitlementResult !== "loading" && entitlementResult.status === "unavailable" ? <Badge>Entitlements fail closed</Badge> : null}</div>}
      />
      {navigation.length > 1 ? (
        <nav className="experience-module-nav" aria-label={`${module.manifest.name} navigation`}>
          {navigation.map((item) => {
            const href = moduleHref(moduleBasePath, item.path);
            const active = normalizeRelativePath(item.path) === normalizedPath;
            return <Link key={item.path || "index"} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>{item.label}</Link>;
          })}
        </nav>
      ) : null}
      <ExperienceModuleBoundary onError={(error) => {
        submitHostEvent("experience.module_error", { message: error.message.slice(0, 160) });
        void runtime.recoverableErrorReporter.report({
          code: "experience.module_render_error",
          experienceId: experience.id,
          moduleId: module.manifest.id,
          safeContext: { message: error.message.slice(0, 160) },
        });
      }}>
        <div className="experience-module-surface">{module.render(context)}</div>
      </ExperienceModuleBoundary>
    </section>
  );
}
