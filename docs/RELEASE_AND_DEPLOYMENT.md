# MarketBook SL release and deployment

No command in this guide publishes or deploys automatically. Production changes
must be reviewed and approved before they affect users.

## Server release

The root `Dockerfile` builds the shared package, generates Prisma Client, compiles
only production server code, installs production dependencies in the runtime
image, runs as a non-development Node process, and checks `/ready` for container
health.

Before deploying a server image:

1. Run the GitHub quality workflow successfully.
2. Create and verify a database backup.
3. Configure production secrets through the hosting provider; never copy `.env`.
4. Run `pnpm --filter server db:migrate:deploy` as a controlled release step.
5. Deploy the immutable image and verify `/health` and `/ready`.
6. Test login and representative read-only business workflows.
7. Monitor errors, response times, authentication throttling, and database health.

Build locally when Docker is installed:

```powershell
docker build -t marketbook-server:local .
```

Do not expose PostgreSQL publicly. Require TLS at the load balancer, set
`CORS_ORIGIN` to the approved application origin, and set `TRUST_PROXY_HOPS` to
the hosting provider's exact proxy count.

## Android preview build

`mobile/eas.json` contains an internal `preview` profile that produces an APK for
installation on a physical Android phone. Before the first EAS build:

1. Choose the permanent Android application ID. This cannot be safely invented
   and becomes difficult to change after Play Store publication.
2. Add that value as `expo.android.package` in `mobile/app.json`.
3. Sign in to the approved MarketBook SL Expo account and link the project.
4. Configure `EXPO_PUBLIC_API_URL` in the EAS preview environment with the HTTPS
   API URL ending in `/api/v1`.
5. From `mobile/`, run `eas build --platform android --profile preview`.

The preview profile produces an APK that can be installed directly. It must not
be submitted to Google Play.

## Android production build

The `production` profile produces an Android App Bundle (AAB) for Google Play.
Before building it:

1. Complete all preview testing against a staging API.
2. Confirm the permanent Android application ID and Expo project ownership.
3. Configure the production HTTPS API URL in the EAS production environment.
4. Review app name, icons, splash screen, version, privacy disclosures, permissions,
   data retention, support contact, and store listing.
5. Confirm licensed payment-provider approval before enabling real integrations.
6. Build with `eas build --platform android --profile production`.

Do not submit the AAB until release approval, signing ownership, privacy policy,
support process, backups, monitoring, and rollback procedures are confirmed.

## iOS status

The project remains compatible with Expo iOS builds, but an Apple bundle ID,
Apple Developer account, signing ownership, privacy declarations, and physical
device testing are still required. These values must be selected by the business
owner before an iOS release profile is finalized.
