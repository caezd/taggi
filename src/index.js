/**
 * Taggi.js
 * ============
 * Plugin de parsing de shortcodes dans les titres Forumactif (ou autre DOM).
 * Chaque shortcode est défini dans une config, avec :
 *   - selector : où chercher le shortcode dans le DOM
 *   - inject   : où réinjecter la balise (facultatif)
 *   - output   : fonction qui retourne le rendu HTML
 *
 * Exemple d’utilisation :
 *
 * const taggiConfig = {
 *   hashtag: {
 *     selector: ".post-title",        // où parser les shortcodes
 *     inject: ".post-tags",           // où réinjecter les balises détectées
 *     output: (content) => `<span class="taggi-hashtag">#${content}</span>`
 *   },
 *   icon: {
 *     selector: ".post-title",
 *     output: (content) => `<i class="taggi-icon">${content}</i>`
 *   }
 * };
 *
 * // Démarrage automatique :
 * new Taggi(taggiConfig);
 *
 * HTML d’entrée :
 * <h2 class="post-title">Sujet [hashtag urgent] [icon ⭐]</h2>
 * <div class="post-tags"></div>
 *
 * HTML rendu automatiquement :
 * <h2 class="post-title">Sujet <span class="taggi-hashtag">#urgent</span> <i class="taggi-icon">⭐</i></h2>
 * <div class="post-tags"><span class="taggi-hashtag">#urgent</span></div>
 */

export default class Taggi {
  constructor(config, options = {}) {
    this.config = config;
    this.options = Object.assign(
      {
        // default options
        defaultSelector: ".taggit",
        debug: true,
        fallbackOutput: (content, tagName) =>
          `<span class="taggit" data-tag="${tagName}">${content}</span>`,
      },
      options
    );
    this.init();
  }

  /**
   * Parcourt la config et applique tout automatiquement
   */
  init() {
    Object.entries(this.config).forEach(([tagName, tag]) => {
      const selector = tag.selector || this.options.defaultSelector;
      const elements = document.querySelectorAll(selector);

      elements.forEach((el) => {
        const original = el.innerHTML;
        let parsed;

        // Si une regex est définie, on l'utilise

        if (tag.regex) {
          parsed = this.parseRegex(original, tag);
          console.log(parsed);
        } else {
          // sinon on utilise le shortcode classique
          parsed = this.parseShortcode(original, tagName, tag);
        }

        console.log(parsed);

        el.innerHTML = parsed.content;

        if (tag.inject && parsed.found.length) {
          let injectTarget;

          if (typeof tag.inject === "function") {
            injectTarget = tag.inject(el);
          } else if (typeof tag.inject === "string") {
            injectTarget = document.querySelector(tag.inject);
          }

          if (!injectTarget) return;

          parsed.found.forEach((rendered) => {
            injectTarget.insertAdjacentHTML(
              `${tag.position || "before"}end`,
              rendered
            );
          });
        }
      });
    });
  }

  parseShortcode(text, tagName, tag) {
    const regex = /\[([^\s\]]+)\s+([^\]]+)\]/g; // capture [tagName content]
    const found = [];

    const content = text.replace(regex, (match, name, inner) => {
      let rendered;

      if (this.config[name]) {
        rendered = this.config[name].output(inner, name);
      } else if (this.options.fallbackOutput) {
        rendered = this.options.fallbackOutput(inner, name);
      } else {
        rendered = match;
      }

      found.push(rendered);
      return rendered;
    });

    return { content, found };
  }

  parseRegex(text, tag) {
    const found = [];
    let content = text;

    const regex = tag.regex;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // match[0] = texte complet
      // match[1..n] = groupes capturés
      const groups = match.slice(1);
      const rendered = tag.output(...groups); // note : tu utilises output, pas template
      found.push(rendered);

      // Supprime le texte original correspondant
      content = content.replace(match[0], "");
    }

    return { content, found };
  }
}
