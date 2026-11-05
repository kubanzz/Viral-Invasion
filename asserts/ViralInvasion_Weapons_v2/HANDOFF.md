# Weapons v2 P0

Two held512×512 transparent PNGs, steady and piercing. Full paths, raw/run/prompt/SHA, visible bounds and exact measured grip/muzzle are in delivery.json.

Use the measured grip as held pivot. Aim is explicitly+X; grip→muzzle is an attachment offset, not the aim axis. The bow release point may be a virtual point inside the open gap. Preserve the full canvas and trim:false. Reuse the same PNG for inventory icons; no extra icon asset is required. Main owns gameplay integration and final Renderer review.

The old emitter occupies much less of its512 canvas than the new weapons. Set world display scale from visible bounds and the hero hand; do not copy the old96-canvas scale blindly. Suggested runtime texture is192², with optional lower-quality128² sampling. No person, hand, projectile, muzzle glow or background is part of the asset.

All existing images and shared selection remain unchanged. Canonical manifest is written once; any revision uses a new version path and a separate receipt.
