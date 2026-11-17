# Typed Notes community submission

Prepared on 2026-11-17 for the `a1126` branch. This is preparation material; no community submission or release has been published by this work.

## Current submission route

The [official plugin submission guide](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin) now directs authors to [Obsidian Community](https://community.obsidian.md). Merge the implementation into the public default branch, publish the matching release, then sign in to the directory, connect GitHub, and add the plugin. Resolve the directory's review feedback before publication.

The old theme/plugin PR templates were [removed on 2026-05-15](https://github.com/obsidianmd/obsidian-releases/commit/d4f069442f61bb055e899cbed7c0c03b5e5c8744). The JSON and PR text below preserve the requested historical format for reference; they are not instructions to open a new upstream PR.

## Directory fields

- Repository: `https://github.com/1800MIRACLE/obsidian.plugin.typed-notes`
- ID: `typed-notes`
- Name: **Typed Notes**
- Author: **1800MIRACLE**
- Description: **Organize notes with colour-coded tag families, custom tag groups, and display titles without renaming files.**

Typed Notes assigns colours to tag families such as `type`, `status`, `author`, and `meta`, with up to three custom groups. It displays a frontmatter property as a note's title while retaining the filename. For example, a note with `title: Planning meeting` and the tag `type/meeting` gains a display title and a family-coloured tag. Editing that title updates the note property. Enable the plugin in Community plugins and configure its tag and title settings as needed. Plectics Alto themes are optional companions.

## Proposed registry entry

Historical destination: append this object to `community-plugins.json`. Values match the imported manifest. The current directory manages the registry entry.

```json
{
  "id": "typed-notes",
  "name": "Typed Notes",
  "author": "1800MIRACLE",
  "description": "Organize notes with colour-coded tag families, custom tag groups, and display titles without renaming files.",
  "repo": "1800MIRACLE/obsidian.plugin.typed-notes"
}
```

## Readiness and remaining work

The branch contains root `main.js`, `manifest.json`, `styles.css`, `versions.json`, and GPL-3.0 `LICENSE`. The readable CommonJS `main.js` is the implementation, with no build step required. The manifest declares `typed-notes`, version `1.0.0`, minimum Obsidian `1.6.0`, and `isDesktopOnly: false`. A current registry check found no exact `typed-notes` ID; recheck availability at submission.

Before submitting:

1. Merge the reviewed implementation and usage README into the public default branch. Ensure the final manifest and this proposed entry still agree.
2. Publish a GitHub release tagged exactly `1.0.0`, attaching `main.js`, `manifest.json`, and this plugin's `styles.css` individually. No releases existed in the destination repository when checked. A ZIP download does not replace these attachments.
3. Test the release in Obsidian. Check tag rendering in Reading view, Live Preview, and Properties; custom groups; title edits/clears; filename preservation; disabling/unloading; and interaction with other title plugins. Test the stated minimum app version and intended desktop/mobile platforms. `isDesktopOnly: false` declares intent, not evidence of Android/iOS validation. This preparation did not run these runtime checks.
4. Complete the maintainer review against [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin%20guidelines), [submission requirements](https://docs.obsidian.md/Plugins/Releasing/Submission%20requirements%20for%20plugins), and [developer policies](https://docs.obsidian.md/Developer%20policies). The source uses DOM observers and title integration, so lifecycle cleanup, secondary-window behaviour, and compatibility need actual review; this document is not a security or API-compliance certification.

A limited source inspection found settings persistence through `saveData` and frontmatter title changes through `processFrontMatter`. A search for common network-request APIs found none. This is not an exhaustive privacy or security audit. The plugin's own code has a GPL-3.0 licence; this plugin package does not contain the companion themes' embedded font or colour-icon assets.

## Historical PR text

Title: `Add plugin: Typed Notes`

The following body follows the former template's structure. Leave unverified checks open; the maintenance commitment is the maintainer's decision.

```markdown
# I am submitting a new Community Plugin

- [ ] I accept responsibility for maintaining this plugin and responding to reports, or arranging transfer/removal if maintenance ends.

## Repo URL

https://github.com/1800MIRACLE/obsidian.plugin.typed-notes

Typed Notes provides colour-coded tag families, three custom tag groups, and frontmatter display titles without renaming files. Configure its tag and title settings after enabling it. Editing a display title updates the note property; tag text remains unchanged.

## Release Checklist

- [ ] The release has been tested on the supported platforms: Windows, macOS, Linux, Android, and iOS.
- [ ] Release 1.0.0 includes individual main.js, manifest.json, and styles.css attachments.
- [ ] The published release tag exactly matches the manifest version, without a v prefix.
- [x] The proposed registry ID and manifest ID are both typed-notes.
- [ ] The final public README explains purpose, installation, settings, and usage.
- [ ] The maintainer has assessed compliance with the developer policies.
- [ ] The maintainer has completed the plugin-guideline self-review.
- [x] A root LICENSE file is included.
- [ ] Applicable third-party licences and attribution have been verified.
```

## Format references

- [Historical official plugin template](https://github.com/obsidianmd/obsidian-releases/blob/c884be96dd43af0bafa7c1a1d80e767d03f2b6ec/.github/PULL_REQUEST_TEMPLATE/plugin.md).
- [WPM Reading Time PR #8396](https://github.com/obsidianmd/obsidian-releases/pull/8396) uses the submission heading, repository URL, and release checklist. Its [accepted commit](https://github.com/obsidianmd/obsidian-releases/commit/bfd91d8e955ead2461b2446a4bf82963ca07e774) confirms the five-field registry structure. The cached PR page predates acceptance; the commit was inspected directly.

No upstream PR, account change, release publication, exhaustive security review, or legal clearance was performed.
