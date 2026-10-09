# Upstream workflow references

These are the original Nuclear workflows, kept for provenance only. GitHub only runs workflows directly inside `.github/workflows/`, so these files do not publish packages, update upstream distribution repositories, deploy websites, or close issues in this repository.

The active Media workflows build the combined desktop app and publish tagged releases to this repository. They use the repository's built-in `GITHUB_TOKEN`; no npm, Snap, Homebrew, Flathub, AUR, or signing secrets are required.

The inherited funding configuration is also preserved here as an inactive reference, rather than presenting this independent fork as the upstream project's sponsorship page.
