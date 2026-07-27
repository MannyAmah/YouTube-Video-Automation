# AI Providers

Three provider capabilities power production. Each sits behind an interface
in `packages/providers`; a missing key fails the affected step with a clear
message (never a placeholder success), and the dashboard's Settings page
shows live configuration status.

| Capability | Primary | Fallback | Env vars |
| --- | --- | --- | --- |
| Script + storyboard text | OpenAI chat (`gpt-4o` default) | — | `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL` |
| Narration (TTS) | ElevenLabs (`eleven_multilingual_v2`) | OpenAI TTS (`gpt-4o-mini-tts`) | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE` |
| Scene illustrations + thumbnail art | OpenAI images (`gpt-image-1` default) | — | `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL` |

## OpenAI

1. https://platform.openai.com → API keys → create a key.
2. Set `OPENAI_API_KEY` on both Railway services.
3. Optional overrides: `OPENAI_TEXT_MODEL` (e.g. `gpt-4o-mini` to cut cost
   during tuning), `OPENAI_IMAGE_MODEL` (`dall-e-3` also supported — the
   adapter handles both response formats).

Structured output: the text adapter requests JSON mode, validates with Zod,
and feeds validation errors back for up to 2 repair attempts before failing
the step.

## ElevenLabs — the channel voice

ElevenLabs is the primary narration engine because the channel's identity
depends on a warm, natural, non-synthetic voice.

1. https://elevenlabs.io → Profile → API key → `ELEVENLABS_API_KEY`.
2. Pick a voice in the Voice Library; copy its voice id into
   `ELEVENLABS_VOICE_ID`. Default if unset: Rachel
   (`21m00Tcm4TlvDq8ikWAM`), a calm narration staple. For this channel,
   audition voices with the brief: *"kind nurse explaining to a worried
   family member — warm, calm, unhurried."*
3. Voice settings used by the adapter: stability 0.55, similarity 0.75,
   slight style, speaker boost — tuned for consistent long-form narration.

A ~7-minute video narrates roughly 6–9k characters ≈ within the Starter
plan's monthly quota for daily videos; check your plan's character limits.

## Cost expectations per long-form video (order of magnitude)

- Script + storyboard: one `gpt-4o` call each with a large evidence prompt
  — cents.
- Illustrations: ~12–16 images — the dominant AI cost; `gpt-image-1`
  medium-quality landscape images land in the low dollars per video.
- Narration: ElevenLabs characters as above.
- Render/upload: compute only.

Token usage for text calls is recorded in artifact metadata (`usage`) for
per-run cost review.

## TEST_MODE

`TEST_MODE=true` replaces all three capabilities (and YouTube) with offline
fakes — real espeak speech, real PNG scene cards, deterministic script
derived verbatim from the FDA evidence — so the entire pipeline can be
rehearsed with zero keys and zero spend. Test-mode artifacts are labelled
`producer: fake-test` and test uploads can never reach a real channel.
