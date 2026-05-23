# Target Repo Cleanup Before Launch

Date: 2026-05-23

## Context

The target GitHub repo already contained generated runtime artifacts under `data/`, including scripts, captions, asset metadata, and video assembly metadata. Those files should not live in source control because they are environment-specific outputs and can expose channel workflow details over time.

## Decision

Replace the target repo contents with the setup-safe launch tree, remove generated `data/` artifacts from Git, and keep runtime output ignored. The repo now contains source code, deployment config, docs, and examples only.

## Lessons

- Before pushing an automation project, inspect the tracked tree for runtime output, not just obvious secrets.
- Keep `data/`, logs, generated media, and local deployment state ignored, even when the app needs those directories at runtime.
- Package scripts should be part of cleanup. Dead scripts that point to missing files are operational debt and should be removed or restored before deploy.
