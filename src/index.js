/**
 * Taggi.js (cleaned)
 * ------------------
 * - Parses shortcodes per tag (single pass per element per tag).
 * - Optional regex-based extraction per tag.
 * - Rewrites the source HTML every run (shortcodes/regex are removed).
 * - Idempotent injection using invisible comment anchors (no DOM duplication).
 */

// ---- Injection helpers (comment-anchored, no layout impact) ----

function normalizeInside(pos) {
    switch (pos) {
        case "afterbegin":
        case "beforeend":
            return pos;
        case "after": // legacy alias
            return "afterbegin";
        case "before": // legacy alias
            return "beforeend";
        default:
            return "beforeend";
    }
}

/**
 * Ajout : support de la syntaxe `inject: "!selector"` pour forcer `el.closest(selector)`
 * -------------------------------------------------------------------------------
 * - Si `inject` est une **fonction**, on appelle la fonction avec `el` (inchangé).
 * - Si `inject` est une **string** qui **commence par `!`**, on enlève le `!` et
 * on retourne **strictement** `el.closest(selector)`.
 * - Sinon (string sans `!`), on conserve le comportement souple précédent :
 * `el.closest(selector) || document.querySelector(selector)`.
 */

function resolveInjectTarget(inject, el) {
    if (typeof inject === "function") return inject(el);
    if (typeof inject === "string") {
        const raw = inject.trim();
        if (!raw) return null;
        if (raw.startsWith("!")) {
            const sel = raw.slice(1).trim();
            if (!sel) return null;
            return el.closest ? el.closest(sel) : null; // forcer closest uniquement
        }
        // comportement par défaut : d'abord proche, sinon global
        return el.closest?.(raw) || document.querySelector(raw);
    }
    return null;
}

function setCommentBlock(target, tagName, htmlList, pos = "beforeend") {
    const { start, end } = ensureCommentBlock(target, tagName, pos);
    // 1) Remove previous content between anchors
    let n = start.nextSibling;
    while (n && n !== end) {
        const next = n.nextSibling;
        n.parentNode.removeChild(n);
        n = next;
    }
    // 2) Deduplicate and insert
    const unique = Array.from(new Set(htmlList));
    if (!unique.length) return;
    const tpl = document.createElement("template");
    tpl.innerHTML = unique.join("");
    start.parentNode.insertBefore(tpl.content, end);
}

function ensureCommentBlock(target, tagName, pos = "beforeend") {
    const startSig = `taggi:start:${tagName}`;
    const endSig = `taggi:end:${tagName}`;
    let start = findComment(target, startSig);
    let end = findComment(target, endSig);
    if (!start || !end) {
        target.insertAdjacentHTML(pos, `<!--${startSig}--><!--${endSig}-->`);
        start = findComment(target, startSig);
        end = findComment(target, endSig);
    }
    return { start, end };
}

function findComment(root, text) {
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_COMMENT,
        null
    );
    let n;
    while ((n = walker.nextNode())) {
        if (n.nodeValue === text) return n;
    }
    return null;
}

// --- helpers root & serialization ---
function resolveRoot(root) {
    if (!root) return document;
    if (typeof root === "string") {
        const tpl = document.createElement("template");
        tpl.innerHTML = root;
        return tpl.content; // DocumentFragment
    }
    // Element | DocumentFragment | Document
    return root;
}

/**
 * Taggi main class
 * ----------------
 * - config: { tagName: { selector, output, inject, position, regex } }
 * - options: { defaultSelector, fallbackOutput }
 */
export default class Taggi {
    constructor(config, options = {}) {
        this.config = config || {};
        this.options = Object.assign(
            {
                defaultSelector: ".taggit",
                fallbackOutput: (content, tagName) =>
                    `<span class="taggit" data-tag="${tagName}">${content}</span>`,
            },
            options
        );
        this.init();
    }

    /** Walk the config and apply parsing + injections. */
    init(root) {
        const scope = resolveRoot(root);
        Object.entries(this.config).forEach(([tagName, tag]) => {
            // 1) selectors -> unique elements
            let selectors = tag.selector || this.options.defaultSelector;
            if (!Array.isArray(selectors)) selectors = [selectors];
            const elements = Array.from(
                new Set(
                    selectors.flatMap((sel) =>
                        Array.from(scope.querySelectorAll(sel))
                    )
                )
            );
            if (!elements.length) return;

            // 2) Aggregate rendered fragments per injection target
            const buckets = new Map(); // Map<HTMLElement, string[]>

            elements.forEach((el) => {
                const original = el.innerHTML;
                const parsed = tag.regex
                    ? this.parseRegex(original, tag)
                    : this.parseShortcodeForTag(original, tagName, tag);

                if (parsed.content !== original) el.innerHTML = parsed.content;

                if (tag.inject && parsed.found.length) {
                    const target = resolveInjectTarget(tag.inject, el);
                    if (!target) return;
                    if (!buckets.has(target)) buckets.set(target, []);
                    buckets.get(target).push(...parsed.found);
                }
            });

            // 3) Injection: rewrite the per-tag comment block (no duplicates)
            if (tag.inject && buckets.size) {
                const pos = normalizeInside(tag.position);
                for (const [target, arr] of buckets) {
                    setCommentBlock(target, tagName, arr, pos);
                }
            }
        });
    }

    /** Parse only the current tag's shortcodes: [tagName content] */
    parseShortcodeForTag(text, tagName, tag) {
        const re = /\[([^\s\]]+)\s+([^\]]+)\]/g;
        const found = [];
        const content = text.replace(re, (m, name, inner) => {
            if (name !== tagName) return m;
            const render =
                (tag && typeof tag.output === "function" && tag.output) ||
                this.options.fallbackOutput;
            const html = render(inner, name);
            found.push(html);
            if (tag && tag.inject) return "";
            return html;
        });
        return { content, found };
    }

    /**
     * Regex-based extraction for a tag.
     * NOTE: we ensure the 'g' flag to avoid infinite loops with exec().
     * Expected: tag.output(...groups) -> string (rendered).
     * Behavior: matched text is removed from source (returns via 'found' for injection).
     */
    parseRegex(text, tag) {
        const found = [];
        let content = text;

        const flags = tag.regex.flags.includes("g")
            ? tag.regex.flags
            : tag.regex.flags + "g";
        const re = new RegExp(tag.regex.source, flags);
        const reForReplace = new RegExp(tag.regex.source, flags);

        let match;
        while ((match = re.exec(text)) !== null) {
            const rendered = tag.output(...match.slice(1));
            found.push(rendered);
        }

        // Remove all matched segments from content
        content = content.replace(reForReplace, "");

        return { content, found };
    }
}
