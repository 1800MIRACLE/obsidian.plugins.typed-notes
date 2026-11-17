// Dependency-free DOM/lifecycle harness; run with node --test main.test.cjs.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");

const PROPERTY = '.metadata-property[data-property-key="tags"]';
const PILL = ".multi-select-pill";
const CLEANUP = '.multi-select-pill[data-tag-kind]';

class Element {
  constructor(selector, text = "") {
    this.nodeType = 1;
    this.selector = selector;
    this.textContent = text;
    this.dataset = {};
    this.children = [];
    this.parentElement = null;
    this.scans = 0;
  }
  append(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  matches(selector) {
    if (selector === CLEANUP) return this.selector === PILL && "tagKind" in this.dataset;
    if (selector === `${PROPERTY} ${PILL}`) return this.selector === PILL && !!this.parentElement?.closest(PROPERTY);
    return selector === this.selector;
  }
  closest(selector) {
    return this.matches(selector) ? this : this.parentElement?.closest(selector) || null;
  }
  querySelectorAll(selector) {
    this.scans++;
    const found = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  get isConnected() { return this.selector === "document" || !!this.parentElement?.isConnected; }
}

function documentStub() {
  const doc = new Element("document");
  doc.nodeType = 9;
  doc.body = doc.append(new Element("body"));
  const classes = new Set();
  doc.body.classList = {
    contains: (c) => classes.has(c),
    toggle(c, force) { const on = force === undefined ? !classes.has(c) : !!force; if (on) classes.add(c); else classes.delete(c); return on; },
  };
  const frames = new Map();
  const listeners = new Map();
  const observers = [];
  let nextFrame = 0;
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe(target) {
      this.connected = true;
      while (target.parentElement) target = target.parentElement;
      target.observers.push(this);
    }
    disconnect() { this.connected = false; }
  }
  doc.defaultView = {
    MutationObserver,
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
  };
  doc.mutate = (records) => {
    for (const observer of observers) if (observer.connected) observer.callback(records);
  };
  doc.flush = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback();
  };
  doc.close = () => listeners.get("unload")?.();
  doc.frames = frames;
  doc.observers = observers;
  return doc;
}

function property(parent, tag) {
  const row = parent.append(new Element(PROPERTY));
  const pill = row.append(new Element(PILL));
  const content = pill.append(new Element(".multi-select-pill-content", tag));
  return { row, pill, content };
}

function load(doc, ready = true, stored, api = {}, existingDocuments = [], modules = {}) {
  let layoutReady;
  const saved = [];
  const events = new Map();
  class Plugin {
    constructor() {
      this.app = { workspace: {
        onLayoutReady(callback) { layoutReady = callback; if (ready) callback(); },
        on(name, callback) { events.set(name, callback); return callback; },
        iterateAllLeaves(visit) { existingDocuments.forEach((ownerDocument) => visit({ view: { containerEl: { ownerDocument } } })); },
      } };
    }
    registerEvent() {}
    registerMarkdownPostProcessor(callback) { this.postProcess = callback; }
    registerEditorExtension(extension) { this.editorExtension = extension; }
  }
  // an optional data.json: loadData/saveData exist only when a test passes one
  if (stored !== undefined) {
    Plugin.prototype.loadData = async () => {
      if (stored instanceof Error) throw stored;
      return JSON.parse(JSON.stringify(stored));
    };
    Plugin.prototype.saveData = async (data) => { saved.push(JSON.parse(JSON.stringify(data))); };
  }
  const context = {
    require(name) {
      if (name in modules) return modules[name];
      assert.equal(name, "obsidian");
      return { Plugin, ...api };
    },
    module: { exports: {} }, document: doc,
    MutationObserver: doc.defaultView.MutationObserver,
  };
  vm.runInNewContext(readFileSync(`${__dirname}/main.js`, "utf8"), context);
  const plugin = new context.module.exports();
  const loaded = plugin.onload();
  return { plugin, loaded, saved, ready: () => layoutReady(), open: (popout) => events.get("window-open")({ doc: popout }) };
}

test("families and original tag spelling remain compatible with theme selectors", () => {
  const doc = documentStub();
  const cases = [[" #TYPE/Article ", "TYPE/Article", "type"], ["form/note", "form/note", "type"],
    ["status/stable", "status/stable", "status"], ["author/name", "author/name", "author"],
    ["meta/test", "meta/test", "meta"], ["science", "science", "topic"]];
  const rows = cases.map(([tag]) => property(doc.body, tag));
  const { plugin } = load(doc);
  rows.forEach(({ pill }, i) => assert.deepEqual(pill.dataset, { tag: cases[i][1], tagKind: cases[i][2] }));
  plugin.onunload();
});

test("Reading and Live Preview expose Plectics family and Half path hooks", async () => {
  const modules = {
    "@codemirror/view": {
      Decoration: { mark: (spec) => spec },
      ViewPlugin: { fromClass: (implementation) => implementation },
    },
    "@codemirror/state": {
      RangeSetBuilder: class {
        constructor() { this.ranges = []; }
        add(from, to, decoration) { this.ranges.push({ from, to, decoration }); }
        finish() { return this.ranges; }
      },
    },
    "@codemirror/language": {
      syntaxTree: (state) => ({ iterate: ({ enter }) => enter({ name: "hashtag-end", from: 0, to: state.text.length }) }),
    },
  };
  const { plugin, loaded } = load(documentStub(), true, { tags: { custom: ["project"] } }, {}, [], modules);
  await loaded;
  for (const [text, kind] of [["type/Note", "type"], ["form/Note", "type"], ["status/stable", "status"],
    ["author/Name", "author"], ["meta/Test", "meta"], ["project/Alpha", "custom-1"], ["science/topic", "topic"]]) {
    const firstChild = { nodeType: 3, nodeValue: text };
    const anchor = {
      dataset: {}, firstChild, childNodes: [firstChild],
      ownerDocument: { createElement: () => ({}) },
      getAttribute: () => `#${text}`,
      querySelector: () => null,
      appendChild(node) { this.childNodes.push(node); },
    };
    plugin.postProcess({ querySelectorAll: () => [anchor] });
    assert.equal(anchor.dataset.tagKind, kind);
    assert.equal(anchor.childNodes[1].className, "plx-tg-rest");
    assert.equal(firstChild.nodeValue + anchor.childNodes[1].textContent, text, "reading tag spelling is preserved");

    const state = { text, doc: { sliceString: (from, to) => text.slice(from, to) } };
    const extension = new plugin.editorExtension({ state, visibleRanges: [{ from: 0, to: text.length }] });
    const [family, rest] = extension.decorations;
    assert.equal(family.decoration.class, "plx-tg-kind");
    assert.equal(family.decoration.attributes["data-tag-kind"], kind);
    assert.equal(family.decoration.attributes["data-tag"], text.toLowerCase());
    assert.equal(rest.decoration.class, "plx-tg-rest");
    assert.equal(text.slice(rest.from, rest.to), text.slice(text.indexOf("/")));
  }
  plugin.onunload();
});

test("100 unrelated edit frames cause no tag scans or animation frames", () => {
  const doc = documentStub();
  const { row } = property(doc.body, "type/article");
  const editor = doc.body.append(new Element("editor"));
  const { plugin } = load(doc);
  const initialScans = doc.scans + row.scans;
  let queuedFrames = 0;
  for (let i = 0; i < 100; i++) {
    doc.mutate([{ type: "characterData", target: { nodeType: 3, parentElement: editor }, addedNodes: [] }]);
    queuedFrames += doc.frames.size;
    doc.flush();
  }
  assert.equal(doc.scans + row.scans - initialScans, 0, "unrelated work must not scan tag containers/document");
  assert.equal(queuedFrames, 0);
  plugin.onunload();
});

test("tag edits batch by property and newly added nested properties are marked", () => {
  const doc = documentStub();
  const first = property(doc.body, "type/article");
  const second = property(doc.body, "meta/test");
  const { plugin } = load(doc);
  const initialDocumentScans = doc.scans;
  const secondScans = second.row.scans;
  first.content.textContent = "status/trash";
  for (let i = 0; i < 10; i++) doc.mutate([{ type: "characterData", target: { nodeType: 3, parentElement: first.content }, addedNodes: [] }]);
  assert.equal(doc.frames.size, 1);
  doc.flush();
  assert.deepEqual(first.pill.dataset, { tag: "status/trash", tagKind: "status" });
  assert.equal(doc.scans, initialDocumentScans);
  assert.equal(second.row.scans, secondScans);
  assert.equal(first.row.scans, 1);
  const wrapper = doc.body.append(new Element("wrapper"));
  const nested = property(wrapper, "author/name");
  doc.mutate([{ type: "childList", target: doc.body, addedNodes: [wrapper] }]);
  doc.flush();
  assert.equal(nested.pill.dataset.tagKind, "author");
  const direct = property(doc.body, "topic");
  doc.mutate([{ type: "childList", target: doc.body, addedNodes: [direct.row] }]);
  doc.flush();
  assert.equal(direct.pill.dataset.tagKind, "topic");
  plugin.onunload();
});

test("unrelated inserted subtrees and detached properties do not trigger document scans", () => {
  const doc = documentStub();
  const tags = property(doc.body, "type/article");
  const { plugin } = load(doc);
  const scans = doc.scans;
  const editor = doc.body.append(new Element("editor"));
  editor.append(new Element("line", "ordinary text"));
  doc.mutate([{ type: "childList", target: doc.body, addedNodes: [editor] }]);
  assert.equal(doc.frames.size, 0);
  doc.mutate([{ type: "childList", target: tags.content, addedNodes: [] }]);
  doc.body.children = doc.body.children.filter((node) => node !== tags.row);
  tags.row.parentElement = null;
  doc.flush();
  assert.equal(tags.row.scans, 0);
  assert.equal(doc.scans, scans);
  plugin.onunload();
});

test("nested insertion bursts discover tags with one subtree scan", () => {
  const doc = documentStub();
  const { plugin } = load(doc);
  const wrapper = doc.body.append(new Element("wrapper"));
  const rows = Array.from({ length: 100 }, () => property(wrapper, "type/note"));
  const records = rows.map(({ row }) => ({ type: "childList", target: wrapper, addedNodes: [row] }));
  // Child records can precede their parent's insertion record.
  records.push({ type: "childList", target: doc.body, addedNodes: [wrapper] });
  doc.mutate(records);
  assert.equal(wrapper.scans + rows.reduce((sum, { row }) => sum + row.scans, 0), 1);
  assert.equal(doc.frames.size, 1);
  doc.flush();
  assert.ok(rows.every(({ pill }) => pill.dataset.tagKind === "type"));
  plugin.onunload();
});

test("duplicate windows, closing popouts and unloading release observers/frames/attributes", () => {
  const doc = documentStub();
  const main = property(doc.body, "type/article");
  const { plugin, open } = load(doc);
  const popout = documentStub();
  const other = property(popout.body, "meta/test");
  open(popout);
  open(popout);
  assert.equal(popout.observers.filter((o) => o.connected).length, 1);
  for (const [current, row] of [[doc, main.row], [popout, other.row]]) {
    current.mutate([{ type: "childList", target: row, addedNodes: [] }]);
    assert.equal(current.frames.size, 1);
  }
  popout.close();
  assert.equal(popout.frames.size, 0);
  assert.ok(popout.observers.every((o) => !o.connected));
  assert.deepEqual(other.pill.dataset, {});
  const remaining = documentStub();
  const remainingTag = property(remaining.body, "author/name");
  open(remaining);
  plugin.onunload();
  assert.equal(doc.frames.size, 0);
  assert.ok(doc.observers.every((o) => !o.connected));
  assert.ok(remaining.observers.every((o) => !o.connected));
  assert.deepEqual(main.pill.dataset, {});
  assert.deepEqual(remainingTag.pill.dataset, {});
  doc.flush();
  assert.deepEqual(main.pill.dataset, {});
});

test("unloading before layout readiness cannot create a late observer", () => {
  const doc = documentStub();
  const { plugin, ready } = load(doc, false);
  plugin.onunload();
  ready();
  assert.equal(doc.observers.length, 0);
});


test("Half adds body.typed-pages-half and removes it when turned off or unloaded", async () => {
  const doc = documentStub();
  const { plugin, loaded, saved } = load(doc, true, { tags: { custom: ["", "", ""], half: true } });
  await loaded;
  assert.equal(doc.body.classList.contains("typed-pages-half"), true);
  await plugin.setHalf(false);
  assert.equal(doc.body.classList.contains("typed-pages-half"), false);
  assert.equal(saved.at(-1).tags.half, false);
  await plugin.setHalf(true);
  assert.equal(doc.body.classList.contains("typed-pages-half"), true);
  assert.equal(saved.at(-1).tags.half, true);
  plugin.onunload();
  assert.equal(doc.body.classList.contains("typed-pages-half"), false);
});

test("Half is off by default", async () => {
  const doc = documentStub();
  const { plugin, loaded } = load(doc, true, null);
  await loaded;
  assert.equal(plugin.settings.tags.half, false);
  assert.equal(doc.body.classList.contains("typed-pages-half"), false);
  plugin.onunload();
});

test("an old Typed Tags data.json keeps its prefixes; missing keys take the defaults", async () => {
  const doc = documentStub();
  const lab = property(doc.body, "lab/alpha");
  const place = property(doc.body, "place/coast");
  const { plugin, loaded, saved } = load(doc, true, { custom: ["Lab", "#place/", ""] });
  await loaded;
  assert.deepEqual(JSON.parse(JSON.stringify(plugin.settings)), {
    tags: { custom: ["Lab", "#place/", ""], half: false },
    titles: { propertyKey: "title", showCaption: true, showInHeader: true, showInExplorer: false, enabled: true },
  });
  assert.equal(lab.pill.dataset.tagKind, "custom-1");
  assert.equal(place.pill.dataset.tagKind, "custom-2");
  await plugin.setHalf(false);
  assert.deepEqual(saved.at(-1).tags.custom, ["Lab", "#place/", ""]);
  assert.equal("custom" in saved.at(-1), false, "saved in the new shape");
  plugin.onunload();
});

test("new-shape data.json: partial titles settings fall back to the defaults", async () => {
  const doc = documentStub();
  const { plugin, loaded } = load(doc, true, { tags: { custom: ["project"] }, titles: { enabled: false, propertyKey: "name" } });
  await loaded;
  assert.deepEqual(JSON.parse(JSON.stringify(plugin.settings)), {
    tags: { custom: ["project", "", ""], half: false },
    titles: { propertyKey: "name", showCaption: true, showInHeader: true, showInExplorer: false, enabled: false },
  });
  plugin.onunload();
});

async function titleHarness(count = 3) {
  class TFile { constructor(i) { this.path = `${i}.md`; this.extension = "md"; } }
  class MarkdownView { constructor(file) { this.file = file; } }
  const pending = new Set();
  const events = new Map();
  const files = Array.from({ length: count }, (_, i) => new TFile(i));
  const views = files.map((file) => new MarkdownView(file));
  const metadata = new Map(files.map((file, i) => [file, { frontmatter: { title: `Title ${i}` } }]));
  let reads = 0;
  const { plugin, loaded } = load(documentStub(), true, undefined, {
    TFile, MarkdownView,
    debounce(callback) {
      const queued = () => pending.add(callback);
      queued.cancel = () => pending.delete(callback);
      return queued;
    },
  });
  plugin.addCommand = () => {};
  plugin.app.workspace.iterateAllLeaves = (visit) => views.forEach((view) => visit({ view }));
  const items = Object.fromEntries(files.map((file) => [file.path, { file, innerEl: {
    classList: { add() {}, remove() {} },
    ownerDocument: { createElement: () => ({ textContent: "", remove() { this.removed = true; } }) },
  } }]));
  plugin.app.workspace.getLeavesOfType = () => [{ view: { fileItems: items } }];
  plugin.app.metadataCache = {
    on(name, callback) { events.set(name, callback); return callback; },
    getFileCache(file) { reads++; return metadata.get(file); },
  };
  plugin.app.vault = { on() {} };
  const synced = [];
  plugin.titles.syncView = (view) => synced.push([view, plugin.titles.getTitle(view.file)]);
  await loaded;
  synced.length = 0;
  reads = 0;
  return {
    plugin, files, views, metadata, synced, pending, items,
    changed: (file) => events.get("changed")(file),
    flush() { const callbacks = [...pending]; pending.clear(); callbacks.forEach((fn) => fn()); },
    reads: () => reads,
  };
}

test("metadata bursts update only affected panes, including duplicate views and removed titles", async () => {
  const h = await titleHarness(1000);
  h.views.push(h.views[5]);
  h.metadata.set(h.files[5], { frontmatter: { title: "Changed" } });
  h.metadata.delete(h.files[7]);
  for (let i = 0; i < 100; i++) h.changed(h.files[5]);
  h.changed(h.files[7]);
  assert.equal(h.pending.size, 1);
  h.flush();
  // syncAll deduplicates the same view, while separate panes of one file both update.
  assert.deepEqual(h.synced.map(([view, title]) => [view.file.path, title]), [["5.md", "Changed"], ["7.md", null]]);
  assert.equal(h.reads(), 2, "two changed files require two reads, not 1000");
  h.views.push(new h.views[5].constructor(h.files[5]));
  h.changed(h.files[5]);
  h.flush();
  assert.equal(h.synced.filter(([v]) => v.file === h.files[5]).length, 3);
  h.plugin.onunload();
});

test("full refresh wins over metadata batching and stop cancels pending work", async () => {
  const h = await titleHarness();
  h.changed(h.files[0]);
  h.plugin.titles.queueSync();
  h.changed(h.files[1]);
  h.flush();
  assert.equal(h.synced.length, 3);
  h.synced.length = 0;
  h.changed(h.files[0]);
  h.plugin.titles.stop();
  assert.equal(h.pending.size, 0);
  h.changed(h.files[1]);
  assert.equal(h.pending.size, 0);
  h.plugin.titles.start();
  h.synced.length = 0;
  h.changed(h.files[2]);
  h.flush();
  assert.deepEqual(h.synced.map(([v]) => v.file.path), ["2.md"]);
  h.plugin.onunload();
});

test("metadata explorer updates preserve unrelated siblings and remove a cleared title", async () => {
  const h = await titleHarness(1000);
  h.plugin.settings.titles.showInExplorer = true;
  h.plugin.titles.syncExplorer(false);
  const beforeFullSync = h.reads();
  h.plugin.titles.syncAll();
  assert.equal(h.reads() - beforeFullSync, 2000, "full refresh baseline: 1000 panes plus 1000 explorer items");
  const unchanged = h.plugin.titles.explorerEls.get(h.items["0.md"]);
  const cleared = h.plugin.titles.explorerEls.get(h.items["5.md"]);
  const reads = h.reads();
  h.metadata.delete(h.files[5]);
  h.changed(h.files[5]);
  h.flush();
  assert.equal(h.reads() - reads, 2, "one pane and one explorer item, not 2000 reads");
  assert.equal(h.plugin.titles.explorerEls.size, 999);
  assert.equal(cleared.removed, true);
  assert.equal(unchanged.removed, undefined);
  h.metadata.set(h.files[5], { frontmatter: { title: "Restored" } });
  h.changed(h.files[5]);
  h.flush();
  assert.equal(h.plugin.titles.explorerEls.get(h.items["5.md"]).textContent, "Restored");
  h.plugin.onunload();
  assert.equal(h.plugin.titles.explorerEls.size, 0);
  assert.equal(unchanged.removed, true);
});

test("Half and reading-tag cleanup cover existing and newly opened popouts", async () => {
  const doc = documentStub();
  const { plugin, loaded, open } = load(doc, true, { tags: { half: true } });
  const early = documentStub();
  open(early);
  await loaded;
  const late = documentStub();
  open(late);
  const documents = [doc, early, late];
  const tags = documents.map((current) => {
    const tag = current.body.append(new Element("a.tag[data-tag-kind]", "type/note"));
    tag.dataset.tagKind = "type";
    return tag;
  });
  assert.ok(documents.every((current) => current.body.classList.contains("typed-pages-half")));
  await plugin.setHalf(false);
  assert.ok(documents.every((current) => !current.body.classList.contains("typed-pages-half")));
  await plugin.setHalf(true);
  early.close();
  assert.equal(early.body.classList.contains("typed-pages-half"), false);
  assert.deepEqual(tags[1].dataset, {});
  plugin.onunload();
  assert.ok(documents.every((current) => !current.body.classList.contains("typed-pages-half")));
  assert.ok(tags.every((tag) => !("tagKind" in tag.dataset)));
});

test("unreadable settings use defaults, notify, and cannot overwrite the unread data", async () => {
  const notices = [];
  const { plugin, loaded, saved } = load(documentStub(), true, new Error("Unreadable settings"), {
    Notice: class { constructor(message) { notices.push(message); } },
  });
  await loaded;
  assert.equal(plugin.settings.tags.half, false);
  assert.equal(plugin.settings.titles.propertyKey, "title");
  assert.equal(plugin.settingsLoadFailed, true);
  assert.equal(notices.length, 1);
  await plugin.setHalf(true);
  await plugin.saveTagSettings();
  await plugin.setTitlesEnabled(false);
  await plugin.saveTitleSettings();
  assert.equal(saved.length, 0);
  assert.equal(notices.length, 5);
  plugin.onunload();
});


test("enabling with an existing popout marks tags and applies Half without a window-open event", async () => {
  const doc = documentStub();
  const popout = documentStub();
  const tags = property(popout.body, "type/note");
  const { plugin, loaded } = load(doc, true, { tags: { half: true } }, {}, [doc, popout, popout]);
  await loaded;
  assert.equal(plugin.observers.size, 2);
  assert.equal(popout.observers.filter((observer) => observer.connected).length, 1);
  assert.equal(tags.pill.dataset.tagKind, "type");
  assert.equal(popout.body.classList.contains("typed-pages-half"), true);
  plugin.onunload();
  assert.equal(popout.body.classList.contains("typed-pages-half"), false);
  assert.deepEqual(tags.pill.dataset, {});
});

test("untouched existing titles preserve concurrent changes while edits and seeded drafts still save", async () => {
  const h = await titleHarness(1);
  const titles = h.plugin.titles;
  const file = h.files[0];
  const view = h.views[0];
  const writes = [];
  h.plugin.app.fileManager = {
    async processFrontMatter(target, update) {
      assert.equal(target, file);
      const frontmatter = { ...h.metadata.get(file)?.frontmatter };
      update(frontmatter);
      h.metadata.set(file, { frontmatter });
      writes.push(frontmatter.title);
    },
  };
  let refreshes = 0;
  titles.syncAll = () => refreshes++;
  const rec = {
    view, file, editFile: file, editStart: "Original title", cancel: false,
    titleEl: { textContent: "Original title", ownerDocument: { getSelection: () => null } },
  };
  h.metadata.set(file, { frontmatter: { title: "Changed externally" } });
  await titles.commit(rec);
  assert.deepEqual(writes, []);
  assert.equal(titles.getTitle(file), "Changed externally");
  assert.equal(refreshes, 1, "blur refreshes the display from the current property");

  rec.editStart = "Changed externally";
  rec.titleEl.textContent = "My edit";
  await titles.commit(rec);
  assert.deepEqual(writes, ["My edit"]);

  h.metadata.set(file, { frontmatter: {} });
  rec.editStart = rec.titleEl.textContent = "Suggested title";
  titles.drafts.set(view, "Suggested title");
  await titles.commit(rec);
  assert.deepEqual(writes, ["My edit", "Suggested title"]);
  assert.equal(titles.drafts.has(view), false);
  h.plugin.onunload();
});
