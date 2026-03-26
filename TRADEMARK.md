# Idswyft Trademark Policy

This policy governs the use of the Idswyft trademarks. The software code is MIT-licensed and free to use, modify, and distribute. The trademarks are separate from the code license and subject to the terms below.

## Trademarks Covered

- The name **"Idswyft"**
- The Idswyft logo (fingerprint icon + wordmark)
- The **"Powered by Idswyft"** badge and text

## What You Can Do (No Permission Needed)

- **Self-host** the software on your own infrastructure
- **Modify** the source code for your own use
- **Fork** the repository and contribute back via pull requests
- **Refer to Idswyft by name** in blog posts, talks, reviews, and comparisons (e.g., "We use Idswyft for identity verification")
- **Link to idswyft.app** or the GitHub repository
- **Use the "Powered by Idswyft" badge** in your application's footer, about page, or documentation

## What You Must Do

Self-hosted deployments of the unmodified or minimally modified software **must retain** the "Powered by Idswyft" attribution in the user-facing interface. This means:

1. The **footer attribution** (Idswyft logo + "Community Edition" text) must remain visible on all pages served by the frontend container
2. The attribution must not be hidden via CSS (`display: none`, `visibility: hidden`, `opacity: 0`), moved off-screen, or made illegible (e.g., 1px font, same color as background)
3. The attribution link to [idswyft.app](https://idswyft.app) must remain functional

This requirement applies to the default user interface. It does **not** apply to:
- API responses or webhook payloads
- Backend logs or internal services
- Custom frontends you build using the Idswyft API (your own UI, your own branding)
- Internal admin dashboards or developer portals not shown to end users

## Removing the Attribution (Commercial License)

If you want to remove the "Powered by Idswyft" footer and all Idswyft branding from the self-hosted UI, you can purchase a **White-Label License** from [enterprise.idswyft.app](https://enterprise.idswyft.app).

The white-label license grants you the right to:
- Remove all Idswyft branding from the user interface
- Replace the logo and name with your own
- Present the verification flow as your own product

The underlying MIT code license remains unchanged.

## What You Cannot Do (Without Permission)

- **Do not remove** the "Powered by Idswyft" attribution from self-hosted deployments of the default UI without a white-label license
- **Do not use** "Idswyft" in your product name, company name, domain name, or app store listing in a way that implies official affiliation (e.g., "Idswyft Pro", "Idswyft Verify", "idswyft-cloud.com")
- **Do not use** the Idswyft logo as your own product's logo or app icon
- **Do not modify** the Idswyft logo (stretch, recolor, combine with other marks)
- **Do not offer** a hosted service using the Idswyft name or branding that could be confused with the official Idswyft Cloud service

## Acceptable Use Examples

| Use Case | Allowed? |
|----------|----------|
| Self-host with default UI and footer | Yes |
| Fork and add features, keep footer | Yes |
| Build your own React frontend calling the Idswyft API | Yes (no footer required) |
| White-label the default UI (with commercial license) | Yes |
| Remove footer without commercial license | No |
| Name your product "Idswyft Enterprise" | No |
| Say "Built with Idswyft" on your website | Yes |
| Use the Idswyft logo in a blog post about the project | Yes |

## Forks and Derivative Works

If you fork Idswyft and make substantial modifications (new name, different branding, distinct product):

- You **must** remove the Idswyft name and logo (do not represent your fork as "Idswyft")
- You **should** include a notice like: "Based on Idswyft (https://github.com/team-idswyft/idswyft)"
- The MIT license terms still apply to the code

## Enforcement

We enforce this policy in good faith. If you're unsure whether your use case is permitted, reach out at [team@idswyft.app](mailto:team@idswyft.app). We want the community to thrive and will work with you to find a solution.

Minor or inadvertent violations will receive a friendly notice before any further action.

## Changes to This Policy

This policy may be updated from time to time. Changes will be committed to this repository. The version in the `main` branch is the current policy.

---

*Last updated: March 2026*
