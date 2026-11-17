/* Typed Notes — a note's type lives in its tags, and its title in a property,
   while the file name stays the filing name. Two parts in one plugin:

   TAGS (formerly Typed Tags) tells themes what family each tag is in, and
   where its path starts, in places where CSS alone cannot read the tag.
   · Properties chips: data-tag / data-tag-kind on each chip, and the part
     from the first "/" on wrapped in <span class="plx-tg-rest">.
   · Reading view tags (a.tag): data-tag-kind and the same span (post processor).
   · Live Preview tags: the same, as CodeMirror mark decorations.
   Families: your Custom 1–3 prefixes first, then type/ (and legacy form/),
   status/, author/, meta/, else topic. "Half" adds body.typed-pages-half.
   The text of a tag is never changed.

   TITLES (formerly Display Title): a frontmatter property (default `title`)
   is shown as the note's title while the filename keeps its filing prefix.
   Editing the shown title edits the property; renaming (explorer, tab, view
   header, F2, caption) renames the file. Obsidian's own title elements are
   never rewritten. They get the class `plx-native-hidden` (visually hidden
   but still focusable, so the rename command and Obsidian's own handlers keep
   working) and a sibling element of ours is inserted right before them. When
   a native title gets focus (rename), its host gets `plx-native-editing`,
   which shows the native element and hides ours until it loses focus.
   "Show display titles" off: the title part does nothing and removes
   everything it added.

   Settings live in this plugin's data.json:
     { tags: { custom: [...], half }, titles: { propertyKey, showCaption,
       showInHeader, showInExplorer, enabled } }
   No network, no other file writes. Plain CommonJS, no build step. */
const obsidian = require("obsidian");
const { Plugin } = obsidian;

/* =====================================================================
   Settings
   ===================================================================== */

const TAG_DEFAULTS = { custom: ["", "", ""], half: false };
const TITLE_DEFAULTS = {
  propertyKey: "title",
  showCaption: true,
  showInHeader: true,
  showInExplorer: false,
  enabled: true,
};
const HALF_CLASS = "typed-pages-half";

/* Missing keys fall back to the defaults. An old Typed Tags data.json
   ({ custom: [...] }) keeps its prefixes. */
function normalizeSettings(data) {
  const d = data && typeof data === "object" ? data : {};
  const t = d.tags && typeof d.tags === "object" ? d.tags : {};
  const custom = Array.isArray(t.custom) ? t.custom : Array.isArray(d.custom) ? d.custom : [];
  return {
    tags: {
      custom: [0, 1, 2].map((i) => typeof custom[i] === "string" ? custom[i] : ""),
      half: typeof t.half === "boolean" ? t.half : TAG_DEFAULTS.half,
    },
    titles: Object.assign({}, TITLE_DEFAULTS, d.titles && typeof d.titles === "object" ? d.titles : {}),
  };
}

/* =====================================================================
   Tags
   ===================================================================== */

const TAG_PROPERTY = '.metadata-property[data-property-key="tags"]';
const REST = "plx-tg-rest";
let customPrefixes = ["", "", ""];
let prefixGeneration = 0;   // bumped when the prefixes change; Live Preview rebuilds

function cleanPrefix(p) {
  return String(p || "").trim().replace(/^#+/, "").replace(/\/+$/, "").toLowerCase();
}

function kindOf(tag) {
  const t = tag.replace(/^#/, "").toLowerCase();
  for (let i = 0; i < customPrefixes.length; i++) {
    const p = customPrefixes[i];
    if (p && (t === p || t.startsWith(p + "/"))) return `custom-${i + 1}`;
  }
  if (t.startsWith("type/") || t.startsWith("form/")) return "type";
  if (t.startsWith("status/")) return "status";
  if (t.startsWith("author/")) return "author";
  if (t.startsWith("meta/")) return "meta";
  return "topic";
}

/* Split an element's single text node at the first "/" after its first
   character: "type/article" -> "type" + <span class="plx-tg-rest">/article</span>.
   Same characters, same order; only a span is added. */
function splitPath(el) {
  const doc = el.ownerDocument;
  if (!doc || !el.childNodes || el.childNodes.length !== 1) return;
  const node = el.firstChild;
  if (!node || node.nodeType !== 3) return;
  const text = node.nodeValue;
  const cut = text.indexOf("/", 1);
  if (cut < 1 || cut === text.length - 1) return;
  const rest = doc.createElement("span");
  rest.className = REST;
  rest.textContent = text.slice(cut);
  node.nodeValue = text.slice(0, cut);
  el.appendChild(rest);
}

function unsplit(el) {
  const rest = el.querySelector && el.querySelector(`:scope > .${REST}`);
  if (rest) el.textContent = el.textContent;
}

function mark(root) {
  const pills = root.querySelectorAll(`${TAG_PROPERTY} .multi-select-pill`);
  for (const p of pills) {
    const c = p.querySelector(".multi-select-pill-content");
    const t = (c ? c.textContent : "").trim().replace(/^#/, "");
    const kind = kindOf(t);
    if (p.dataset.tag !== t || p.dataset.tagKind !== kind) {
      p.dataset.tag = t;
      p.dataset.tagKind = kind;
    }
    // Obsidian puts the text in an inner <span>; split inside that
    const textEl = c && c.firstElementChild && c.children.length === 1 && c.firstElementChild.tagName === "SPAN" ? c.firstElementChild : c;
    if (textEl && !(c.querySelector && c.querySelector(`.${REST}`))) splitPath(textEl);
  }
}

function markInline(el) {
  for (const a of el.querySelectorAll("a.tag")) {
    const t = (a.getAttribute("href") || a.textContent || "").trim();
    a.dataset.tagKind = kindOf(t);
    if (!a.querySelector(`.${REST}`)) splitPath(a);
  }
}

/* Live Preview: CodeMirror owns that DOM, so the same marks are decorations. */
function livePreviewExtension() {
  let view, state, language;
  try {
    view = require("@codemirror/view");
    state = require("@codemirror/state");
    try { language = require("@codemirror/language"); } catch (e) { language = null; }
  } catch (e) { return null; }
  const { ViewPlugin, Decoration } = view;
  const restMark = Decoration.mark({ class: REST });
  const kindMarks = new Map();
  const kindMark = (kind, tag) => {
    const key = kind + " " + tag;
    if (!kindMarks.has(key)) {
      if (kindMarks.size > 500) kindMarks.clear();
      kindMarks.set(key, Decoration.mark({ class: "plx-tg-kind", attributes: { "data-tag-kind": kind, "data-tag": tag } }));
    }
    return kindMarks.get(key);
  };
  function build(v) {
    const builder = new state.RangeSetBuilder();
    const found = [];
    const doc = v.state.doc;
    if (language && language.syntaxTree) {
      for (const { from, to } of v.visibleRanges) {
        language.syntaxTree(v.state).iterate({ from, to, enter(node) {
          if (/hashtag-end/.test(node.name)) found.push([node.from, node.to]);
        } });
      }
    }
    found.sort((a, b) => a[0] - b[0]);
    for (const [from, to] of found) {
      const text = doc.sliceString(from, to);
      const kind = kindOf(text);
      const cut = text.indexOf("/", 1);
      const ranges = [];
      ranges.push([from, to, kindMark(kind, text.replace(/^#/, "").toLowerCase())]);
      if (cut > 0 && cut < text.length - 1) ranges.push([from + cut, to, restMark]);
      for (const [f, t, d] of ranges) builder.add(f, t, d);
    }
    return builder.finish();
  }
  const plugin = ViewPlugin.fromClass(class {
    constructor(v) { this.gen = prefixGeneration; this.decorations = build(v); }
    update(u) { if (this.gen !== prefixGeneration) { this.gen = prefixGeneration; this.decorations = build(u.view); return; }
      if (u.docChanged || u.viewportChanged || u.transactions.some((tr) => tr.reconfigured) || language && language.syntaxTree(u.startState) !== language.syntaxTree(u.state)) this.decorations = build(u.view); }
  }, { decorations: (p) => p.decorations });
  return state.Prec ? state.Prec.lowest(plugin) : plugin;
}

/* =====================================================================
   Titles
   ===================================================================== */

const FMT_PLUGIN_ID = "obsidian-front-matter-title-plugin";

/* ---------- filename -> clean title ---------- */

const PREFIX_RULES = [
  /^[~_@!+%]+\s*/,                                // ~ Maintenance, ~Meta, _x, @x, !x, +x, %x
  /^\d{12,14}(?:\s*\([^)]*\))?\s*/,               // 251101162712 (Sat, Nov 1)
  /^[([][^()[\]]{1,32}[)\]]\s+/,                  // (2.0) , (Compendium) , [00]
  /^\d+(?:\.\d+)*\s*[.·•\-–—:)]\s+/,              // 0. , 98 · , 05 · , 1.2 - , 3)
];

function cleanFilename(basename) {
  let s = String(basename || "").trim();
  let prev;
  do {
    prev = s;
    for (const re of PREFIX_RULES) s = s.replace(re, "");
    s = s.trim();
  } while (s && s !== prev);
  return s || String(basename || "").trim();
}

function normalizeTitle(text) {
  return String(text == null ? "" : text).replace(/\s+/g, " ").trim();
}

/* The Display Title plugin, as one part of Typed Notes. `active` is the
   master toggle at work: while it is false, syncAll does nothing. */
class DisplayTitles {
  constructor(plugin) {
    this.plugin = plugin;
    this.recs = new Map();          // MarkdownView -> record of our elements
    this.drafts = new Map();        // MarkdownView -> seeded title not yet saved
    this.explorerEls = new Map();   // explorer file item -> our sibling element
    this.active = false;
    this.layoutReady = false;
  }

  get app() { return this.plugin.app; }
  get settings() { return this.plugin.settings.titles; }

  /* once, after the settings are loaded */
  load() {
    const { MarkdownView, TFile, debounce } = obsidian;
    if (!MarkdownView || !TFile || !debounce) return;   // not in Obsidian (test harness)
    const plugin = this.plugin;
    // Layout/settings events still refresh everything; metadata only changes one file.
    let fullSync = false;
    const changedFiles = new Set();
    const flush = debounce(() => {
      const files = fullSync ? null : new Set(changedFiles);
      fullSync = false;
      changedFiles.clear();
      this.syncAll(files);
    }, 30, true);
    this.queueSync = (file) => {
      if (!this.active) return;
      if (file instanceof TFile) changedFiles.add(file);
      else fullSync = true;
      flush();
    };
    this.queueSync.cancel = () => {
      if (flush.cancel) flush.cancel();
      fullSync = false;
      changedFiles.clear();
    };
    this.registerCommands();

    const ws = this.app.workspace;
    plugin.registerEvent(ws.on("file-open", () => this.queueSync()));
    plugin.registerEvent(ws.on("layout-change", () => this.queueSync()));
    plugin.registerEvent(ws.on("active-leaf-change", () => this.queueSync()));
    plugin.registerEvent(ws.on("window-open", () => this.queueSync()));
    plugin.registerEvent(this.app.metadataCache.on("changed", (file) => this.queueSync(file)));
    plugin.registerEvent(this.app.vault.on("rename", () => this.queueSync()));

    ws.onLayoutReady(() => {
      if (plugin.unloaded) return;
      this.layoutReady = true;
      if (this.settings.enabled) this.start();
    });
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.syncAll();
    this.warnIfConflict();
  }

  /* Display Title's own unload: removes every element and class it added */
  stop() {
    this.active = false;
    if (this.queueSync && this.queueSync.cancel) this.queueSync.cancel();
    for (const view of Array.from(this.recs.keys())) this.teardownView(view);
    this.syncExplorer(true);
    this.drafts.clear();
  }

  setEnabled(on) {
    if (!on) this.stop();
    else if (this.layoutReady && this.queueSync) this.start();
  }

  get key() {
    return normalizeTitle(this.settings.propertyKey) || "title";
  }

  /* ---------- property access ---------- */

  findKey(fm) {
    if (!fm) return null;
    const key = this.key;
    if (Object.prototype.hasOwnProperty.call(fm, key)) return key;
    const lower = key.toLowerCase();
    return Object.keys(fm).find((k) => k.toLowerCase() === lower) || null;
  }

  getTitle(file) {
    if (!(file instanceof obsidian.TFile)) return null;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const k = this.findKey(fm);
    if (!k) return null;
    let v = fm[k];
    if (Array.isArray(v)) v = v.find((x) => typeof x === "string" || typeof x === "number");
    if (typeof v !== "string" && typeof v !== "number") return null;
    const t = normalizeTitle(v);
    return t || null;
  }

  async setTitle(file, value) {
    const v = normalizeTitle(value);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      const k = this.findKey(fm) || this.key;
      if (v) fm[k] = v;
      else delete fm[k];
    });
  }

  /* ---------- sync ---------- */

  markdownViews() {
    const out = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof obsidian.MarkdownView) out.push(leaf.view);
    });
    return out;
  }

  syncAll(files = null) {
    if (!this.active) return;
    const live = new Set(this.markdownViews());
    for (const view of Array.from(this.recs.keys())) {
      if (!live.has(view)) this.teardownView(view, true);
    }
    for (const view of live) if (!files || files.has(view.file)) this.syncView(view);
    this.syncExplorer(false, files);
  }

  syncView(view) {
    const file = view.file;
    const hasDraft = this.drafts.has(view);
    const title = file ? (hasDraft ? this.drafts.get(view) : this.getTitle(file)) : null;
    let rec = this.recs.get(view);

    if (!file || (!title && !hasDraft)) {
      // never pull the element out from under the user's cursor
      if (rec && !this.isEditing(rec)) this.teardownView(view);
      return;
    }
    if (!rec) {
      rec = this.createRec(view);
      this.recs.set(view, rec);
    }
    rec.file = file;
    const editing = this.isEditing(rec);
    const s = this.settings;

    view.containerEl.classList.add("plx-has-display-title");

    /* inline title (Live Preview / Source in .cm-sizer, Reading in the preview header) */
    const native = view.inlineTitleEl;
    if (native && native.parentElement) {
      this.watchNative(rec, native);
      const host = native.parentElement;
      if (!editing) {
        if (s.showCaption) {
          if (rec.captionEl.parentElement !== host || rec.captionEl.nextSibling !== native) host.insertBefore(rec.captionEl, native);
          if (rec.titleEl.parentElement !== host || rec.titleEl.nextSibling !== rec.captionEl) host.insertBefore(rec.titleEl, rec.captionEl);
        } else {
          rec.captionEl.remove();
          if (rec.titleEl.parentElement !== host || rec.titleEl.nextSibling !== native) host.insertBefore(rec.titleEl, native);
        }
      }
      native.classList.add("plx-native-hidden");
      if (!editing && rec.titleEl.textContent !== title) rec.titleEl.textContent = title;
      rec.titleEl.setAttribute("aria-label", `Display title (property: ${this.key})`);
      rec.titleEl.classList.toggle("is-draft", hasDraft);
      const capText = `file: ${file.name}`;
      if (rec.captionEl.textContent !== capText) rec.captionEl.textContent = capText;
    }

    /* view header title + tab header (text only; clicking still renames) */
    const shown = title || (hasDraft ? this.drafts.get(view) : "");
    if (s.showInHeader && shown) {
      const vh = view.titleEl;
      if (vh && vh.parentElement) {
        this.watchNative(rec, vh);
        if (rec.vhEl.parentElement !== vh.parentElement || rec.vhEl.nextSibling !== vh) vh.parentElement.insertBefore(rec.vhEl, vh);
        vh.classList.add("plx-native-hidden");
        if (rec.vhEl.textContent !== shown) rec.vhEl.textContent = shown;
        rec.vhEl.setAttribute("aria-label", `${file.name} (click to rename the file)`);
      }
      const tab = view.leaf && view.leaf.tabHeaderInnerTitleEl;
      if (tab && tab.parentElement) {
        if (rec.tabEl.parentElement !== tab.parentElement || rec.tabEl.nextSibling !== tab) tab.parentElement.insertBefore(rec.tabEl, tab);
        tab.classList.add("plx-native-hidden");
        if (rec.tabEl.textContent !== shown) rec.tabEl.textContent = shown;
        rec.tab = tab;
      }
    } else {
      this.removeHeaderBits(rec);
    }
  }

  isEditing(rec) {
    const el = rec.titleEl;
    return !!el && el.ownerDocument.activeElement === el;
  }

  createRec(view) {
    const doc = (view.inlineTitleEl && view.inlineTitleEl.ownerDocument) || view.containerEl.ownerDocument;
    const rec = { view, file: view.file, natives: new Map(), cancel: false, editStart: "", editFile: null };

    const t = doc.createElement("div");
    t.className = "inline-title plx-display-title plx-dt-sib";
    t.setAttribute("contenteditable", "plaintext-only");
    t.setAttribute("role", "textbox");
    t.setAttribute("aria-multiline", "false");
    t.setAttribute("spellcheck", String(!!this.app.vault.getConfig("spellcheck")));
    t.setAttribute("autocapitalize", "on");
    t.setAttribute("enterkeyhint", "done");
    t.setAttribute("tabindex", "-1");
    t.setAttribute("data-tooltip-delay", "900");
    t.setAttribute("aria-description", "Edits the display-title property. The file name is not changed.");
    rec.titleEl = t;

    const c = doc.createElement("div");
    c.className = "plx-display-title-file plx-dt-sib";
    c.setAttribute("role", "button");
    c.setAttribute("tabindex", "0");
    c.setAttribute("aria-label", "Rename the file (the display title stays)");
    c.setAttribute("data-tooltip-delay", "500");
    rec.captionEl = c;

    const vh = doc.createElement("div");
    vh.className = "view-header-title plx-vh-title plx-dt-sib";
    vh.setAttribute("data-tooltip-delay", "700");
    rec.vhEl = vh;

    const tab = doc.createElement("div");
    tab.className = "workspace-tab-header-inner-title plx-tab-title plx-dt-sib";
    rec.tabEl = tab;

    this.bindTitle(rec);

    const rename = (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      this.startInlineRename(rec);
    };
    c.addEventListener("mousedown", (e) => e.stopPropagation());
    c.addEventListener("click", rename);
    c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") rename(e); });

    vh.addEventListener("click", (e) => {
      e.preventDefault();
      this.startHeaderRename(rec);
    });

    // reading/live mode switches move Obsidian's inline title between hosts
    rec.observer = new MutationObserver(() => this.queueSync());
    rec.observer.observe(view.containerEl, { attributes: true, attributeFilter: ["data-mode"] });
    return rec;
  }

  bindTitle(rec) {
    const el = rec.titleEl;
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("focus", () => {
      rec.editStart = el.textContent;
      rec.editFile = rec.file;
      rec.cancel = false;
    });
    el.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        el.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        rec.cancel = true;
        el.textContent = rec.editStart;
        el.blur();
      }
    });
    el.addEventListener("beforeinput", (e) => {
      if (e.inputType === "insertParagraph" || e.inputType === "insertLineBreak") e.preventDefault();
    });
    el.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = normalizeTitle(e.clipboardData ? e.clipboardData.getData("text/plain") : "");
      if (text) el.ownerDocument.execCommand("insertText", false, text);
    });
    el.addEventListener("drop", (e) => e.preventDefault());
    el.addEventListener("input", () => {
      // keep other panes on the same file in step while typing
      const text = el.textContent;
      for (const r of this.recs.values()) {
        if (r !== rec && r.file === rec.file && !this.isEditing(r)) r.titleEl.textContent = text;
      }
    });
    el.addEventListener("blur", () => { this.commit(rec); });
  }

  async commit(rec) {
    const el = rec.titleEl;
    const file = rec.editFile || rec.file;
    const view = rec.view;
    const sel = el.ownerDocument.getSelection();
    if (sel && sel.rangeCount && el.contains(sel.anchorNode)) sel.removeAllRanges();
    const wasDraft = this.drafts.has(view);
    this.drafts.delete(view);
    rec.editFile = null;
    if (rec.cancel || !file) {
      rec.cancel = false;
      this.syncAll();
      return;
    }
    const value = normalizeTitle(el.textContent);
    const current = this.getTitle(file) || "";
    // Focusing an existing title must not revert a concurrent property edit.
    if (value === current || !wasDraft && value === normalizeTitle(rec.editStart)) {
      this.syncAll();
      return;
    }
    try {
      await this.setTitle(file, value);
    } catch (err) {
      console.error("[plectics-display-title] could not write property", err);
      new obsidian.Notice("Display title: could not write the property (see console).");
    }
    this.queueSync();
  }

  /* native element focus -> host shows native, hides ours */
  watchNative(rec, native) {
    if (rec.natives.has(native)) return;
    const onFocus = () => native.parentElement && native.parentElement.classList.add("plx-native-editing");
    const onBlur = () => {
      const host = native.parentElement;
      // Obsidian's own blur handler (rename) reads the text first; reveal ours after it
      window.setTimeout(() => { host && host.classList.remove("plx-native-editing"); this.queueSync(); }, 0);
    };
    native.addEventListener("focus", onFocus);
    native.addEventListener("blur", onBlur);
    rec.natives.set(native, { onFocus, onBlur });
  }

  /* Focus one of Obsidian's own (hidden) filename titles: it shows itself in
     place and Obsidian's handlers rename the file on Enter/blur. Falls back
     to Obsidian's rename prompt. */
  focusNative(el) {
    if (!el || !el.isConnected || !el.isContentEditable) return false;
    el.focus();
    const doc = el.ownerDocument;
    if (doc.activeElement !== el) return false;
    const range = doc.createRange();
    range.selectNodeContents(el);
    const sel = doc.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  startInlineRename(rec) {
    if (this.focusNative(rec.view.inlineTitleEl)) return;
    this.startHeaderRename(rec);
  }

  startHeaderRename(rec) {
    if (this.focusNative(rec.view.titleEl)) return;
    if (rec.file) this.app.fileManager.promptForFileRename(rec.file);
  }

  removeHeaderBits(rec) {
    rec.vhEl.remove();
    rec.tabEl.remove();
    const vh = rec.view.titleEl;
    if (vh) vh.classList.remove("plx-native-hidden");
    const tab = rec.tab || (rec.view.leaf && rec.view.leaf.tabHeaderInnerTitleEl);
    if (tab) tab.classList.remove("plx-native-hidden");
  }

  teardownView(view, gone) {
    const rec = this.recs.get(view);
    if (!rec) return;
    this.recs.delete(view);
    if (rec.observer) rec.observer.disconnect();
    for (const [native, h] of rec.natives) {
      native.removeEventListener("focus", h.onFocus);
      native.removeEventListener("blur", h.onBlur);
      native.classList.remove("plx-native-hidden");
      if (native.parentElement) native.parentElement.classList.remove("plx-native-editing");
    }
    rec.natives.clear();
    rec.titleEl.remove();
    rec.captionEl.remove();
    this.removeHeaderBits(rec);
    if (view.inlineTitleEl) view.inlineTitleEl.classList.remove("plx-native-hidden");
    if (view.containerEl) view.containerEl.classList.remove("plx-has-display-title");
    if (!gone) this.drafts.delete(view);
  }

  /* ---------- file explorer ---------- */

  syncExplorer(removeAll, files = null) {
    const want = !removeAll && this.settings.showInExplorer;
    if (!want && this.explorerEls.size === 0) return;
    const seen = new Set();
    if (want) {
      for (const leaf of this.app.workspace.getLeavesOfType("file-explorer")) {
        const items = leaf.view && leaf.view.fileItems;
        if (!items) continue;
        const paths = files ? Array.from(files, (file) => file.path) : Object.keys(items);
        for (const path of paths) {
          const item = items[path];
          if (!item || !(item.file instanceof obsidian.TFile) || item.file.extension !== "md" || !item.innerEl) continue;
          const t = this.getTitle(item.file);
          if (!t) continue;
          const inner = item.innerEl;
          let sib = this.explorerEls.get(item);
          if (!sib) {
            sib = inner.ownerDocument.createElement("div");
            sib.className = "tree-item-inner nav-file-title-content plx-explorer-title plx-dt-sib";
            this.explorerEls.set(item, sib);
          }
          if (inner.parentElement && (sib.parentElement !== inner.parentElement || sib.nextSibling !== inner)) inner.parentElement.insertBefore(sib, inner);
          if (sib.textContent !== t) sib.textContent = t;
          inner.classList.add("plx-native-hidden");
          seen.add(item);
        }
      }
    }
    for (const [item, sib] of Array.from(this.explorerEls)) {
      if (seen.has(item) || want && files && !files.has(item.file)) continue;
      sib.remove();
      if (item.innerEl) item.innerEl.classList.remove("plx-native-hidden");
      this.explorerEls.delete(item);
    }
  }

  /* ---------- commands (unavailable while display titles are off) ---------- */

  activeView() {
    if (!this.active) return null;
    const v = this.app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    return v && v.file ? v : null;
  }

  registerCommands() {
    const plugin = this.plugin;
    plugin.addCommand({
      id: "set-display-title",
      name: "Set display title…",
      checkCallback: (checking) => {
        const view = this.activeView();
        if (!view) return false;
        if (!checking) this.focusTitle(view);
        return true;
      },
    });
    plugin.addCommand({
      id: "suggest-display-title",
      name: "Suggest display title from filename",
      checkCallback: (checking) => {
        const view = this.activeView();
        if (!view) return false;
        if (!checking) {
          const file = view.file;
          new TitleModal(this.app, {
            heading: "Display title",
            note: `From file name “${file.basename}”. Stored in the “${this.key}” property; the file is not renamed.`,
            value: cleanFilename(file.basename),
            submit: (v) => { if (normalizeTitle(v)) this.setTitle(file, v); },
          }).open();
        }
        return true;
      },
    });
    plugin.addCommand({
      id: "clear-display-title",
      name: "Clear display title",
      checkCallback: (checking) => {
        const view = this.activeView();
        if (!view || !this.getTitle(view.file)) return false;
        if (!checking) this.setTitle(view.file, "");
        return true;
      },
    });
  }

  focusTitle(view) {
    if (!this.getTitle(view.file)) this.drafts.set(view, cleanFilename(view.file.basename));
    this.syncView(view);
    const rec = this.recs.get(view);
    const el = rec && rec.titleEl;
    if (!el || !el.isConnected || !el.offsetParent) {
      // inline title hidden (Obsidian setting off, or scrolled host missing): use a modal
      this.drafts.delete(view);
      this.syncView(view);
      const file = view.file;
      new TitleModal(this.app, {
        heading: "Display title",
        note: `Stored in the “${this.key}” property; the file is not renamed. Leave empty to remove it.`,
        value: this.getTitle(file) || cleanFilename(file.basename),
        submit: (v) => this.setTitle(file, v),
      }).open();
      return;
    }
    if (view.getMode() === "source" && view.editor && view.editor.scrollTo) {
      try { view.editor.scrollTo(null, 0); } catch (e) { /* ignore */ }
    }
    el.focus();
    const doc = el.ownerDocument;
    const range = doc.createRange();
    range.selectNodeContents(el);
    const sel = doc.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  warnIfConflict() {
    const enabled = this.app.plugins && this.app.plugins.enabledPlugins;
    if (enabled && enabled.has(FMT_PLUGIN_ID)) {
      new obsidian.Notice("Typed Notes: “Front Matter Title” is also enabled. Turn off its inline title, tab, header and explorer features (or this plugin), or both will rewrite the same titles.", 12000);
    }
  }
}

/* ---------- modal ---------- */

const TitleModal = obsidian.Modal ? class extends obsidian.Modal {
  constructor(app, opts) {
    super(app);
    this.opts = opts;
  }

  onOpen() {
    const { contentEl, opts } = this;
    this.titleEl.setText(opts.heading);
    contentEl.addClass("plx-display-title-modal");
    if (opts.note) contentEl.createEl("p", { text: opts.note, cls: "plx-display-title-modal-note" });
    const input = contentEl.createEl("input", { type: "text", cls: "plx-display-title-modal-input" });
    input.value = opts.value || "";
    input.setAttribute("aria-label", "Display title");
    const done = () => {
      const v = input.value;
      this.close();
      opts.submit(v);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); done(); }
    });
    const row = contentEl.createDiv({ cls: "modal-button-container" });
    row.createEl("button", { text: "Set title", cls: "mod-cta" }).addEventListener("click", done);
    row.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    window.setTimeout(() => { input.focus(); input.select(); }, 0);
  }

  onClose() {
    this.contentEl.empty();
  }
} : null;

/* =====================================================================
   Plugin
   ===================================================================== */

class TypedPages extends Plugin {
  onload() {
    this.observers = new Map();
    this.unloaded = false;
    this.settings = normalizeSettings(null);
    customPrefixes = this.settings.tags.custom.map(cleanPrefix);
    this.titles = new DisplayTitles(this);

    /* ---- tags: Properties chips, one batched observer per document ---- */
    const watch = (doc) => {
      if (this.unloaded || this.observers.has(doc)) return;
      const win = doc.defaultView;
      const pending = new Set();
      let frame = null;
      const run = () => {
        frame = null;
        for (const property of pending) if (property.isConnected) mark(property);
        pending.clear();
      };
      const obs = new win.MutationObserver((records) => {
        const addedRoots = new Set();
        for (const record of records) {
          const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
          const property = target?.closest(TAG_PROPERTY);
          if (property) {
            pending.add(property);
          } else {
            for (const node of record.addedNodes) {
              if (node.nodeType !== 1) continue;
              addedRoots.add(node);
            }
          }
        }
        for (const node of addedRoots) {
          // A parent scan already discovers descendants inserted in the same delivery.
          let parent = addedRoots.size > 1 ? node.parentElement : null;
          while (parent && !addedRoots.has(parent)) parent = parent.parentElement;
          if (parent) continue;
          if (node.matches(TAG_PROPERTY)) pending.add(node);
          for (const added of node.querySelectorAll(TAG_PROPERTY)) pending.add(added);
        }
        if (pending.size && frame === null) frame = win.requestAnimationFrame(run);
      });
      obs.observe(doc.body, { childList: true, subtree: true, characterData: true });
      const stop = () => {
        obs.disconnect();
        if (frame !== null) win.cancelAnimationFrame(frame);
        pending.clear();
        win.removeEventListener("unload", stop);
        this.observers.delete(doc);
        doc.body.classList.toggle(HALF_CLASS, false);
        for (const a of doc.querySelectorAll("a.tag[data-tag-kind]")) { delete a.dataset.tagKind; unsplit(a); }
        doc.querySelectorAll(".multi-select-pill[data-tag-kind]").forEach((p) => {
          delete p.dataset.tag; delete p.dataset.tagKind;
          const c = p.querySelector(".multi-select-pill-content");
          const r = c && c.querySelector(`.${REST}`);
          if (r) unsplit(r.parentElement);
        });
      };
      this.observers.set(doc, stop);
      this.applyHalf();
      win.addEventListener("unload", stop, { once: true });
      mark(doc);
    };
    this.watch = watch;
    this.app.workspace.onLayoutReady(() => {
      watch(document);
      this.app.workspace.iterateAllLeaves((leaf) => {
        const doc = leaf.view.containerEl?.ownerDocument;
        if (doc) watch(doc);
      });
    });
    this.registerEvent(this.app.workspace.on("window-open", (win) => watch(win.doc)));

    /* the parts the test harness does not stub: settings, Reading view, Live Preview */
    if (typeof this.registerMarkdownPostProcessor === "function") this.registerMarkdownPostProcessor((el) => markInline(el));
    if (typeof this.registerEditorExtension === "function") {
      const ext = livePreviewExtension();
      if (ext) this.registerEditorExtension(ext);
    }
    if (obsidian.PluginSettingTab && typeof this.addSettingTab === "function") this.addSettingTab(new TypedPagesTab(this.app, this));

    /* ---- saved settings, then the Half class and the titles part ---- */
    const hasData = typeof this.loadData === "function";
    this.ready = Promise.resolve().then(() => hasData ? this.loadData() : null).catch(() => {
      this.settingsLoadFailed = true;
      if (!this.unloaded) new obsidian.Notice("Typed Notes: settings could not be read. Using defaults; changes will not be saved until the plugin is reloaded.", 12000);
      return null;
    }).then((data) => {
      if (this.unloaded) return;
      this.settings = normalizeSettings(data);
      if (hasData) this.applyPrefixes();
      this.applyHalf();
      this.titles.load();
    });
    return this.ready;
  }

  /* ---- tags ---- */
  applyPrefixes() {
    customPrefixes = this.settings.tags.custom.map(cleanPrefix);
    prefixGeneration++;
    for (const doc of this.observers.keys()) mark(doc);
    const ws = this.app.workspace;
    if (ws.getLeavesOfType) for (const leaf of ws.getLeavesOfType("markdown")) {
      const v = leaf.view;
      if (v && v.previewMode && v.previewMode.rerender) v.previewMode.rerender(true);
      const cm = v && v.editor && v.editor.cm;
      if (cm && cm.dispatch) cm.dispatch({});
    }
  }
  applyHalf() {
    for (const doc of this.observers.keys()) {
      doc.body.classList.toggle(HALF_CLASS, !this.unloaded && !!this.settings.tags.half);
    }
  }
  async saveSettings() {
    await this.ready;
    // Never overwrite settings that failed to load with the fallback defaults.
    if (this.settingsLoadFailed) {
      new obsidian.Notice("Typed Notes: settings were not saved because the existing settings could not be read. Reload the plugin to retry.");
      return;
    }
    await this.saveData(this.settings);
  }
  async setHalf(on) {
    this.settings.tags.half = !!on;
    this.applyHalf();
    await this.saveSettings();
  }
  async saveTagSettings() {
    await this.saveSettings();
    this.applyPrefixes();
  }

  /* ---- titles ---- */
  async setTitlesEnabled(on) {
    this.settings.titles.enabled = !!on;
    this.titles.setEnabled(!!on);
    await this.saveSettings();
  }
  async saveTitleSettings() {
    await this.saveSettings();
    this.titles.syncAll();
  }

  onunload() {
    this.unloaded = true;
    for (const stop of this.observers.values()) stop();
    this.titles.stop();
  }
}

/* =====================================================================
   Settings tab
   ===================================================================== */

const TypedPagesTab = obsidian.PluginSettingTab ? class extends obsidian.PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl, plugin } = this;
    const { Setting } = obsidian;
    containerEl.empty();
    const tags = plugin.settings.tags;
    const s = plugin.settings.titles;

    /* ---- Tags ---- */
    new Setting(containerEl).setName("Tags").setHeading();

    new Setting(containerEl)
      .setName("Half: fill the part before the first /")
      .addToggle((t) => t.setValue(tags.half).onChange(async (v) => {
        await plugin.setHalf(v);
      }));

    containerEl.createEl("p", { text: "Custom tag groups: your own tag families. Tags whose path starts with a prefix below (for example lab for #lab and #lab/alpha) take that group's colour. Set the colours in Style Settings › Plectics Alto › Typed tags › Custom tag groups (when you use the Plectics Alto theme). A prefix here wins over the built-in families." });
    for (let i = 0; i < 3; i++) {
      new Setting(containerEl)
        .setName(`Custom ${i + 1} prefix`)
        .setDesc("Without # and without the trailing /. Empty: slot not used.")
        .addText((text) => text
          .setPlaceholder(["project", "place", "source"][i])
          .setValue(tags.custom[i])
          .onChange(async (value) => {
            tags.custom[i] = value.trim();
            await plugin.saveTagSettings();
          }));
    }

    /* ---- Titles ---- */
    new Setting(containerEl).setName("Titles").setHeading();

    new Setting(containerEl)
      .setName("Show display titles")
      .addToggle((t) => t.setValue(s.enabled).onChange(async (v) => {
        await plugin.setTitlesEnabled(v);
      }));

    new Setting(containerEl)
      .setName("Property name")
      .setDesc("Frontmatter property that holds the display title.")
      .addText((t) => t
        .setPlaceholder("title")
        .setValue(s.propertyKey)
        .onChange(async (v) => {
          s.propertyKey = normalizeTitle(v) || "title";
          await plugin.saveTitleSettings();
        }));

    new Setting(containerEl)
      .setName("Show file name under the title")
      .setDesc("A small caption with the real file name. Click it to rename the file.")
      .addToggle((t) => t.setValue(s.showCaption).onChange(async (v) => {
        s.showCaption = v;
        await plugin.saveTitleSettings();
      }));

    new Setting(containerEl)
      .setName("Show in tab and view header")
      .setDesc("Display text only. Clicking the view-header title still renames the file.")
      .addToggle((t) => t.setValue(s.showInHeader).onChange(async (v) => {
        s.showInHeader = v;
        await plugin.saveTitleSettings();
      }));

    new Setting(containerEl)
      .setName("Show in file explorer")
      .setDesc("Display text only. Renaming in the explorer still renames the file.")
      .addToggle((t) => t.setValue(s.showInExplorer).onChange(async (v) => {
        s.showInExplorer = v;
        await plugin.saveTitleSettings();
      }));
  }
} : null;

module.exports = TypedPages;
module.exports.cleanFilename = cleanFilename;
module.exports.normalizeSettings = normalizeSettings;
