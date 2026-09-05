# Route tree and review map

Each destination renders a meaningful screen, an explicit loading/error state, or a useful feature placeholder. Dynamic example IDs below belong to the isolated demo only.

## Public and identity

```text
/                                 Marketing homepage
/features                         Product overview
/how-it-works                     Seven-stage customer journey
/offers                           Public offers
/offers/:offerId                  Offer details (welcome, continuity)
/experience                       Public/free experience container
/about                            Product purpose
/help                             Help and FAQ
/contact                          Contact form; delivery unavailable
/privacy                          Clearly labelled policy placeholder
/terms                            Clearly labelled terms placeholder
/accessibility                    Accessibility approach
/preferences                      Referral/storage preferences
/r/:referralCode                  Pending referral capture (NURTURE-DEMO)
/survey/:surveyId                 Published public survey (demo-survey)
/login                            Email/password + configured providers
/register                         Profile registration / anonymous linking
/forgot-password                  Reset request
/reset-password                   Password reset action-code handling
/verify-email                     Verification / resend / refresh
/invite/:invitationId             Accept / expired / already-accepted states
/organizations/new                Protected provisioning service placeholder
/onboarding                       Authenticated profile introduction
/demo                             Isolated demo guide; unavailable in production
/*                                Helpful not-found screen
```

Invitation examples: `demo-invite`, `expired`, and `accepted`. Authenticated acceptance illustrates member creation in demo memory only. It does not send a registration email or create a production membership.

## Customer

All routes are under the registered-user guard; anonymous users can remain in the public experience but cannot enter the private hub.

```text
/app                              Personal launchpad
/app/experience                   Primary module container
/app/secondary                    Secondary module container
/app/offers                       Continued experiences / upgrade
/app/upgrade                      Upgrade alias
/app/notifications                Personal inbox
/app/feedback                     Feedback form
/app/referrals                    Referral link and pending attribution
/app/profile                      Personal profile
/app/account                      Security / memberships / privacy actions
/app/settings                     Theme and communication preferences
/app/billing                      Server-only Stripe boundary
/app/help                         Help in the app shell
```

Sign out is an action available in the account menu and mobile More menu; it is not an unsafe GET route. A global feedback button opens the same form in a dialog.

## Organization

Use `/org/demo-org` to review the sample organization as owner, administrator, or manager. Each nested route also enforces its capability; hiding navigation is not the authorization boundary.

```text
/org/:organizationId              Organization overview
  /dashboard                      Pipeline dashboard
  /contacts                       Search / filter / segment / consent overview
  /contacts/new                   Add contact
  /contacts/import                Import validation placeholder
  /contacts/:contactId            Detail / participation / communication history
  /contacts/:contactId/edit       Edit contact
  /lifecycle                      Seven-stage contact representation
  /sequences                      Follow-up sequence list
  /sequences/new                  New sequence
  /sequences/:sequenceId          Visual timing editor / draft / published / enabled
  /templates                      Email/SMS template library
  /templates/new                  New template
  /templates/:templateId          Escaped editor and sample preview
  /surveys                        Survey list
  /surveys/new                    Builder with seven question types
  /surveys/:surveyId              Survey settings and questions
  /surveys/:surveyId/preview      Non-submitting preview
  /surveys/:surveyId/results      Private response/results placeholder
  /offers                         Organization offers
  /offers/new                     Offer configuration
  /offers/:offerId                Offer editor
  /analytics                      Labelled illustrative lifecycle metrics
  /feedback                       Tenant feedback review
  /members                        Team list (owner/admin)
  /invitations                    Invitation metadata and pending filter (owner/admin)
  /invitations/new                Invitation draft, no delivery (owner/admin)
  /roles                          Capability matrix (owner/admin)
  /profile                        Organization profile (owner/admin)
  /settings                       Organization defaults (owner/admin)
  /referrals                      Referral configuration / illustrative ledger (owner/admin)
  /billing                        Organization billing boundary (owner/admin)
```

Representative IDs: `c-avery`, `post-experience`, `template-thankYou`, `template-sms-followup`, `demo-survey`, `welcome`, and `continuity`.

## Manual walkthrough

Start at the public home, follow an offer into the public experience, begin a guest session, register, and complete or skip onboarding. Visit the secondary experience, offers, feedback, and referral entry to return to acquisition. In the demo guide, choose an owner to inspect the same journey through contacts, follow-ups, surveys, and pipeline metrics. Switch to an ordinary member and directly request an organization URL to verify denial.
