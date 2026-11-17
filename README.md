# Typed Notes

Typed Notes is an Obsidian plugin for colour-coded tag families, custom tag groups, and display titles that preserve filenames. It is designed for use with [Plectics Alto](https://github.com/1800MIRACLE/obsidian.themes.plectics-alto) and [Plectics Alto Icons](https://github.com/1800MIRACLE/obsidian.themes.plectics-alto-icons), and also provides tag colours with themes that use Obsidian's standard tag variables.

For example, a file named `01. Planning meeting.md` can display **Planning meeting** as its title while keeping its filename and links. Its `type/meeting` and `status/draft` tags receive different family colours.

## Download and installation

Requires **Obsidian 1.6.0 or later**. The plugin is distributed as ready-to-use JavaScript; no build tools are required.

**[Download Typed Notes (ZIP)](downloads/typed-notes.zip?raw=true)**

The archive contains a folder named **`typed-notes`**. Extract it, then drag or copy that folder into your vault's `.obsidian/plugins/` folder.

### Windows

1. Download the ZIP. In File Explorer, right-click it and choose **Extract All**.
2. Open your vault folder. If `.obsidian` is hidden, enable **Hidden items** in File Explorer's **View** menu.
3. Open `.obsidian/plugins`; create the `plugins` folder if necessary.
4. Drag the extracted `typed-notes` folder into `plugins`.

### macOS

1. Download the ZIP and double-click it in Finder to extract it.
2. Open your vault folder. Press **Command + Shift + .** to show hidden folders.
3. Open `.obsidian/plugins`; create the `plugins` folder if necessary.
4. Drag the extracted `typed-notes` folder into `plugins`.

### Linux

1. Download the ZIP and extract it with your archive manager.
2. Open your vault folder. In most file managers, **Ctrl + H** shows hidden folders.
3. Open `.obsidian/plugins`; create the `plugins` folder if necessary.
4. Copy the extracted `typed-notes` folder into `plugins`.

The result must contain these files directly inside the plugin folder:

```text
Your vault/
└── .obsidian/
    └── plugins/
        └── typed-notes/
            ├── main.js
            ├── manifest.json
            └── styles.css
```

Restart Obsidian. Open **Settings → Community plugins**, enable community plugins if they are disabled, and enable **Typed Notes** in the installed plugins list. Open its settings to configure tags and titles.

These paths assume Obsidian's default configuration folder, `.obsidian`. If your vault uses a different configuration folder, use that folder instead. Installation is per vault.

### Alternative: GitHub's Download ZIP

The green **Code → Download ZIP** button downloads the whole repository. Extract it, create a folder named `typed-notes`, and copy the root `main.js`, `manifest.json` and `styles.css` into that folder. Place it in `.obsidian/plugins/` as above.

Do not leave an extra repository folder between `typed-notes` and these three files. The installation ZIP linked above already has the correct structure.

## Quick start

Add this frontmatter to a note:

```yaml
---
title: Planning meeting
tags:
  - type/meeting
  - status/draft
  - project/alpha
---
```

The plugin shows **Planning meeting** as the display title and marks the type and status tag families. To give `project/alpha` its own family colour, enter `project` in **Typed Notes → Tags → Custom 1 prefix**. Without that custom prefix, it belongs to the Topic family.

No filename changes are required. Notes without the configured title property keep their ordinary Obsidian title.

## Tag families

The plugin identifies a family from the tag prefix in Reading view, Live Preview and the Properties `tags` field. It preserves the tag text, so tags remain clickable and searchable.

| Family | Matching tags | Default plugin colour |
|---|---|---|
| Topic | All tags without another recognised prefix | Cyan |
| Type | `type/…`; legacy `form/…` is also recognised | Purple |
| Status | `status/…` | Yellow |
| Stable status | `status/stable` | Green |
| Empty or discarded status | `status/empty`, `status/trash` | Red |
| Author | `author/…` | Orange |
| Meta | `meta/…` | Grey |
| Custom 1, 2, 3 | User-defined prefixes | Pink, blue, green |

These colours use Obsidian's colour variables. A theme can override their appearance; Plectics Alto uses its own family palette and tag styles.

### Custom groups

There are three custom prefix slots. Enter a prefix without `#` or a trailing `/`, such as `project`. It matches both `project` and `project/alpha`. Matching ignores case. Custom groups take precedence over built-in families; if several custom slots match, the first matching slot wins. Leave a slot empty to disable it.

### Half-filled tags

Enable **Half: fill the part before the first /** to give the prefix a solid fill. In `type/article`, `type` is filled and `/article` keeps a lighter tint. A tag without `/` is filled as a whole.

A theme's own tag rules can override this setting. With Plectics Alto, choose its tag style through Style Settings when you want to control the theme's rendering.

## Display titles

The `title` frontmatter property supplies a note's display title by default. You can choose another property name in the settings.

- **Inline title:** click the displayed title to edit it. Enter saves; Escape cancels. Leaving the field also saves. Clearing the text removes the title property.
- **Filename caption:** a caption below the title shows the actual filename. Clicking it starts a file rename.
- **Tab and view header:** show the display title by default. The view-header rename action still renames the file.
- **File explorer:** display titles are optional and off by default. Explorer rename still renames the file.

Editing the display title updates the frontmatter property. Ordinary rename actions change the filename. The plugin does not rewrite links into display-title aliases.

Title values are trimmed and consecutive whitespace is collapsed. Strings and numbers are accepted; for a list value, the first string or number is used. A missing or empty property leaves the normal filename title in place. Saving an edited display title stores a single text value.

### Commands

Open Obsidian's command palette and search for Typed Notes:

| Command | Effect |
|---|---|
| **Set display title…** | Focuses the title editor, or opens a dialog if the inline title is unavailable |
| **Suggest display title from filename** | Proposes a title with common filing prefixes removed, then asks you to confirm |
| **Clear display title** | Removes the configured title property from the current note |

The suggestion recognises prefixes such as `~`, `(2.0) `, numbered headings such as `01. `, and 12–14 digit timestamps. It does not rename the file. These commands require an active Markdown note and **Show display titles** enabled.

### Limits and other title plugins

The plugin does not substitute display titles in search results, the quick switcher, graph labels, backlinks, embeds or Canvas cards.

Avoid enabling another plugin's title replacement on the same surfaces. If Front Matter Title is installed, disable its inline-title, tab, header and explorer replacements, or disable display titles in Typed Notes. Likewise, disable the older standalone Plectics Display Title plugin when using Typed Notes for titles.

## Settings

| Section | Setting | Default |
|---|---|---|
| Tags | Half: fill the part before the first / | Off |
| Tags | Custom 1, 2, 3 prefix | Empty |
| Titles | Show display titles | On |
| Titles | Property name | `title` |
| Titles | Show file name under the title | On |
| Titles | Show in tab and view header | On |
| Titles | Show in file explorer | Off |

Turning off display titles removes the title replacements while keeping tag styling active. Disabling the whole plugin removes its visual additions; saved frontmatter remains in your notes.

## Updating, migration and removal

For an update, disable Typed Notes, replace `main.js`, `manifest.json` and `styles.css` with the new versions, and re-enable it. Keep the existing `data.json` in the installed folder: it contains your settings.

If you previously installed **Typed Pages** under `.obsidian/plugins/typed-pages/`, Typed Notes has a new plugin ID and a separate folder:

1. Disable Typed Pages and install Typed Notes using the instructions above.
2. With both plugins disabled, copy the old `typed-pages/data.json`, if present, into `typed-notes/data.json` to retain its tag and title settings. Preserve a copy first if the new installation already has settings you want to keep.
3. Enable Typed Notes. Keep Typed Pages disabled so the two plugins do not decorate the same tags or titles.

The plugin also understands the older Typed Tags settings format containing a top-level `custom` array. It does not automatically discover or migrate another plugin's settings file.

To remove Typed Notes, disable it and remove `.obsidian/plugins/typed-notes/`. This removes its settings but leaves note titles and tags stored in frontmatter intact.

## Theme integration and development

[Plectics Alto](https://github.com/1800MIRACLE/obsidian.themes.plectics-alto) and [Plectics Alto Icons](https://github.com/1800MIRACLE/obsidian.themes.plectics-alto-icons) use the plugin's tag annotations for their own styles. Neither theme is required for the plugin to run.

For theme authors, tags receive `data-tag-kind` with `topic`, `type`, `status`, `author`, `meta`, or `custom-1` through `custom-3`. Properties chips and Live Preview marks also carry `data-tag`. Reading-view tags retain their tag in `href`. The path starting at the first `/` is wrapped in `.plx-tg-rest`. Plugin colour rules use Obsidian's `--tag-*` and `--pill-*` variables with low-specificity selectors so themes can override them.

The implementation is plain CommonJS in `main.js`, with `styles.css` and `manifest.json`. There is no compilation step. To run the included checks with Node.js, use `node --test main.test.cjs`.

## Privacy and compatibility

The plugin makes no network requests. It saves settings in its own `data.json` and writes a note's configured frontmatter property when you save or clear a display title. Normal filename rename actions remain available through Obsidian.

The manifest allows mobile use and requires Obsidian 1.6.0 or later; this does not mean every platform and version has been tested. Tag or title rendering can be affected by themes, CSS snippets and other plugins.

When reporting an issue, include your Obsidian version, operating system, theme, relevant plugin settings, and a small note that reproduces the problem.

## Licence

Licensed under **GPL-3.0**. See [LICENSE](LICENSE).

To rebuild the installable ZIP from the checked-out files, run `python package.py` (Python 3, standard library only). The script verifies every packaged file against its source.
