/**
 * PiloTerra — Générateur de pages publiques indexables
 * ----------------------------------------------------
 * Plugin Vite. Au moment du `vite build`, il interroge la vue
 * v_seo_pages dans Supabase et écrit dans dist/ :
 *
 *   - une page HTML complète par contenu publié
 *     /agents/<slug>, /formations/<slug>, /prompts/<slug>,
 *     /sources-de-donnees/<slug>
 *   - une page de rubrique par famille  (/agents, /formations, ...)
 *   - sitemap.xml
 *   - llms.txt
 *
 * Le contenu est écrit EN DUR dans le HTML : aucun JavaScript n'est
 * nécessaire pour le lire. C'est ce qui rend le portail visible à la
 * fois pour Google et pour les robots des IA génératives, qui eux
 * n'exécutent pas de JavaScript.
 *
 * L'application React n'est pas modifiée. Ces pages vivent à côté.
 *
 * En cas d'échec (réseau coupé, Supabase indisponible), le plugin
 * affiche un avertissement mais NE FAIT PAS échouer le build : un
 * déploiement ne doit jamais casser à cause du SEO.
 */

const SITE = 'https://piloterra.fr';

/**
 * Balises <script> et <link> extraites de dist/index.html au moment du
 * build. Elles sont réinjectées dans chaque page générée : c'est ce qui
 * permet à l'application React de démarrer sur ces URL et de prendre la
 * main sur le contenu statique.
 */
let ASSETS_APPLICATION = '';


// Connexion Supabase : fournie par vite.config.ts depuis les variables
// d'environnement (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Plus
// aucune valeur en dur — voir pluginSeoPiloTerra() plus bas.

/**
 * Configuration des rubriques.
 *
 * `ancre` = l'ancre de navigation de l'application React vers laquelle
 * renvoie le bouton « ouvrir dans le portail ». À VÉRIFIER si tu
 * renommes des pages dans App.tsx.
 */
const RUBRIQUES = {
  agents: {
    nom: 'Agents IA',
    titre: 'Agents IA prêts à être testés',
    intro:
      "Des agents IA développés ou référencés par PiloTerra, utilisables directement en démonstration. Chaque fiche décrit à quoi sert l'agent, pour quel métier, et ses limites.",
    ancre: '#agents-ia',
    lienLabel: 'Essayer la démonstration'
  },
  formations: {
    nom: 'Formations IA',
    titre: 'Formations IA, de la découverte à la spécialisation',
    intro:
      "Les formations conçues et animées par bziiit, du niveau découverte au niveau spécialiste. Chaque fiche indique à qui la formation s'adresse et ce que vous saurez faire à l'issue.",
    ancre: '#formation-presentiel',
    lienLabel: 'Télécharger le programme détaillé'
  },
  prompts: {
    nom: 'Prompts métier',
    titre: 'Bibliothèque de prompts IA métier',
    intro:
      "Des prompts prêts à l'emploi pour les métiers de terrain, avec pour chacun le modèle recommandé et un conseil de frugalité issu du référentiel AFNOR SPEC 2314.",
    ancre: '#prompts',
    lienLabel: 'Ouvrir dans la bibliothèque'
  },
  'sources-de-donnees': {
    nom: 'Sources de données ouvertes',
    titre: 'Sources de données ouvertes pour l’IA',
    intro:
      "Un recensement de sources de données ouvertes mobilisables pour construire des solutions IA, avec une lecture métier de ce qu'on peut en tirer.",
    ancre: '#data-agri',
    lienLabel: 'Accéder à la source'
  }
};

/**
 * Marchés actifs, lus dans la table `marches` au moment du build
 * (étape 8). Vide si la table est inaccessible : le plugin retombe alors
 * sur les seules pages « tous marchés », qui ne bougent jamais.
 */
let MARCHES = [];

/**
 * Marchés pour lesquels des pages sont réellement écrites : actifs et
 * au-dessus du seuil de contenus. On ne fait jamais de lien vers une page
 * de marché qui n'existe pas.
 */
let MARCHES_PUBLIES = [];

/** Rubriques réellement écrites pour chaque marché : { code: [rubriques] }.
 *  Évite de créer un lien vers /<marche>/<rubrique> quand ce marché n'a
 *  aucun contenu dans cette rubrique. */
let RUBRIQUES_PAR_MARCHE = {};

/** Nombre minimum de contenus pour qu'un marché ait ses pages. Une page
 *  quasi vide est pénalisée par Google : mieux vaut ne pas la publier. */
const SEUIL_PAGES_MARCHE = 3;

/**
 * Règle de visibilité, identique à `estVisiblePour()` côté portail et à
 * `est_visible_pour()` en base : un tableau vide signifie transverse.
 */
const pageDuMarche = (page, marche) =>
  !Array.isArray(page.marches) || page.marches.length === 0
    ? true
    : page.marches.includes(marche.code);

/** « l'agriculture », « la logistique »… avec repli sur le libellé. */
const motMarche = (marche) => marche.mot_accroche || String(marche.libelle || '').toLowerCase();

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

const echapper = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Convertisseur markdown minimal. On ne prend pas de dépendance
 * supplémentaire : le format produit par les agents n8n est connu et
 * limité à des titres de niveau 2 et 3, des listes et du gras.
 */
function markdownVersHtml(md) {
  if (!md) return '';
  const lignes = echapper(md).split(/\r?\n/);
  const sortie = [];
  let dansListe = false;

  const fermerListe = () => {
    if (dansListe) {
      sortie.push('</ul>');
      dansListe = false;
    }
  };

  for (const ligneBrute of lignes) {
    const ligne = ligneBrute.trim();

    if (!ligne) {
      fermerListe();
      continue;
    }
    if (ligne.startsWith('### ')) {
      fermerListe();
      sortie.push(`<h3>${enrichir(ligne.slice(4))}</h3>`);
      continue;
    }
    if (ligne.startsWith('## ')) {
      fermerListe();
      sortie.push(`<h2>${enrichir(ligne.slice(3))}</h2>`);
      continue;
    }
    if (ligne.startsWith('- ') || ligne.startsWith('* ')) {
      if (!dansListe) {
        sortie.push('<ul>');
        dansListe = true;
      }
      sortie.push(`<li>${enrichir(ligne.slice(2))}</li>`);
      continue;
    }
    fermerListe();
    sortie.push(`<p>${enrichir(ligne)}</p>`);
  }
  fermerListe();
  return sortie.join('\n');
}

const enrichir = (t) =>
  t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');

const tronquer = (t, n) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
};

/* ------------------------------------------------------------------ */
/* Données structurées (JSON-LD)                                       */
/* ------------------------------------------------------------------ */

const ORGANISATION = {
  '@type': 'Organization',
  name: 'bziiit',
  url: 'https://bziiit.com'
};

function jsonLd(page, url) {
  const base = {
    '@context': 'https://schema.org',
    name: page.titre,
    description: tronquer(page.seo_description || page.description_courte, 300),
    url
  };
  const extra = page.extra || {};

  switch (page.source_type) {
    case 'formation': {
      const fiche = {
        ...base,
        '@type': 'Course',
        provider: ORGANISATION
      };
      if (extra.niveau) fiche.educationalLevel = String(extra.niveau);
      if (Array.isArray(extra.publics) && extra.publics.length) {
        fiche.audience = extra.publics.map((p) => ({
          '@type': 'Audience',
          audienceType: String(p)
        }));
      }
      if (Array.isArray(extra.competences) && extra.competences.length) {
        fiche.teaches = extra.competences.map(String);
      }
      return fiche;
    }
    case 'agent':
      return {
        ...base,
        '@type': 'SoftwareApplication',
        applicationCategory: 'BusinessApplication',
        author: ORGANISATION
      };
    case 'source_donnees':
      return { ...base, '@type': 'Dataset' };
    case 'prompt': {
      const fiche = {
        ...base,
        '@type': 'Article',
        headline: tronquer(page.titre, 110),
        author: ORGANISATION,
        publisher: ORGANISATION
      };
      if (page.lastmod) fiche.dateModified = String(page.lastmod).slice(0, 10);
      return fiche;
    }
    default:
      return { ...base, '@type': 'WebPage' };
  }
}

function filAriane(rubrique, page, url) {
  const conf = RUBRIQUES[rubrique];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'PiloTerra', item: SITE },
      { '@type': 'ListItem', position: 2, name: conf.titre, item: `${SITE}/${rubrique}` },
      { '@type': 'ListItem', position: 3, name: page.titre, item: url }
    ]
  };
}

/* ------------------------------------------------------------------ */
/* Gabarit HTML                                                        */
/* ------------------------------------------------------------------ */

/**
 * Style du contenu statique.
 *
 * TOUT est cloisonné sous `.seo-statique`, jamais de sélecteur d'élément
 * nu. Sans ce cloisonnement, les règles survivent au démarrage de React
 * et s'appliquent à l'application : `main{max-width:760px}` écrasait la
 * largeur du portail (`<main class="flex-grow w-full">`), qui s'affichait
 * alors comme sur un téléphone. Corrigé le 25/09/2026.
 */
const CSS = `
.seo-statique{--vert:#1f6b3b;--vert-clair:#eaf4ed;--encre:#16241c;--gris:#5c6b61;--bord:#dfe7e2;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--encre);line-height:1.65;background:#fff}
.seo-statique *{box-sizing:border-box}
.seo-statique .bandeau{background:var(--vert);padding:14px 20px}
.seo-statique .bandeau a{color:#fff;text-decoration:none;font-weight:600;letter-spacing:.2px}
.seo-statique main{max-width:760px;margin:0 auto;padding:32px 20px 64px}
.seo-statique nav.fil{font-size:.85rem;color:var(--gris);margin-bottom:20px}
.seo-statique nav.fil a{color:var(--gris)}
.seo-statique h1{font-size:2rem;line-height:1.2;margin:.2em 0 .4em}
.seo-statique h2{font-size:1.25rem;margin:1.9em 0 .5em;color:var(--vert)}
.seo-statique h3{font-size:1.05rem;margin:1.4em 0 .4em}
.seo-statique .chapo{font-size:1.1rem;color:var(--gris);margin-bottom:28px}
.seo-statique .actions{margin:32px 0;display:flex;gap:12px;flex-wrap:wrap}
.seo-statique .bouton{display:inline-block;padding:12px 20px;border-radius:8px;background:var(--vert);color:#fff;text-decoration:none;font-weight:600}
.seo-statique .bouton.secondaire{background:#fff;color:var(--vert);border:1px solid var(--vert)}
.seo-statique .bloc-prompt{background:var(--vert-clair);border:1px solid var(--bord);border-radius:10px;padding:18px;white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9rem;overflow-x:auto}
.seo-statique .etiquettes{margin:24px 0;font-size:.85rem;color:var(--gris)}
.seo-statique .etiquette{display:inline-block;background:var(--vert-clair);border-radius:999px;padding:3px 11px;margin:0 6px 6px 0}
.seo-statique ul.liste-rubrique{list-style:none;padding:0}
.seo-statique ul.liste-rubrique li{border-bottom:1px solid var(--bord);padding:18px 0}
.seo-statique ul.liste-rubrique a{color:var(--vert);font-weight:600;text-decoration:none;font-size:1.1rem}
.seo-statique ul.liste-rubrique p{margin:.3em 0 0;color:var(--gris)}
.seo-statique footer{border-top:1px solid var(--bord);margin-top:48px;padding-top:20px;font-size:.85rem;color:var(--gris)}
.seo-statique footer a{color:var(--vert)}
`;

/**
 * Couleur d'une page de marché (étape 10) : --vert prend la couleur du
 * marché, --vert-clair une teinte très claire de celle-ci. La couleur de
 * marque (#1b5e1f, agriculture) garde le rendu actuel : rien n'est posé.
 */
const COULEUR_MARQUE = '#1b5e1f';

function styleAccent(accent) {
  if (!accent || !/^#[0-9a-fA-F]{6}$/.test(accent) || accent.toLowerCase() === COULEUR_MARQUE) {
    return '';
  }
  const canaux = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));
  // 90 % de blanc : même rôle que #eaf4ed pour le vert.
  const clair =
    '#' + canaux.map((c) => Math.round(c + (255 - c) * 0.9).toString(16).padStart(2, '0')).join('');
  return ` style="--vert:${accent.toLowerCase()};--vert-clair:${clair}"`;
}

function gabarit({ titre, description, url, corps, schemas, accent }) {
  const blocs = schemas
    .map(
      (s) =>
        `<script type="application/ld+json">${JSON.stringify(s).replace(/</g, '\\u003c')}</script>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${echapper(tronquer(titre, 65))}</title>
<meta name="description" content="${echapper(tronquer(description, 160))}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${echapper(tronquer(titre, 65))}">
<meta property="og:description" content="${echapper(tronquer(description, 160))}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="PiloTerra">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary">
${blocs}
<style>${CSS}</style>
${ASSETS_APPLICATION}
</head>
<body>
<!--
  Le contenu ci-dessous est lu par les moteurs de recherche et par les
  robots des IA génératives, qui n'exécutent pas de JavaScript.
  Pour un visiteur humain, l'application React démarre et remplace ce
  contenu par le portail complet, ouvert sur la fiche concernée.
-->
<div id="root">
<div class="seo-statique"${styleAccent(accent)}>
<div class="bandeau"><a href="${SITE}/">PiloTerra</a></div>
<main>
${corps}
</main>
</div>
</div>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Rendu des pages                                                     */
/* ------------------------------------------------------------------ */

function pageDetail(page) {
  const rubrique = page.rubrique;
  const conf = RUBRIQUES[rubrique];
  const url = `${SITE}${page.url_path}`;
  const extra = page.extra || {};

  const actions = [];
  if (page.external_link) {
    actions.push(
      `<a class="bouton" href="${echapper(page.external_link)}" rel="noopener">${conf.lienLabel}</a>`
    );
  }
  actions.push(
    `<a class="bouton secondaire" href="${SITE}/${conf.ancre}">Ouvrir dans le portail</a>`
  );

  let complement = '';

  if (page.source_type === 'prompt' && extra.content) {
    complement += `<h2>Le prompt</h2>\n<div class="bloc-prompt">${echapper(extra.content)}</div>`;
    const etiquettes = [];
    if (extra.category) etiquettes.push(extra.category);
    if (extra.recommended_model) etiquettes.push(`Modèle conseillé : ${extra.recommended_model}`);
    if (Array.isArray(extra.tags)) etiquettes.push(...extra.tags);
    if (etiquettes.length) {
      complement += `\n<p class="etiquettes">${etiquettes
        .map((e) => `<span class="etiquette">${echapper(e)}</span>`)
        .join('')}</p>`;
    }
  }

  if (page.source_type === 'formation') {
    const etiquettes = [];
    if (extra.niveau) etiquettes.push(extra.niveau);
    if (Array.isArray(extra.publics)) etiquettes.push(...extra.publics);
    if (etiquettes.length) {
      complement += `\n<p class="etiquettes">${etiquettes
        .map((e) => `<span class="etiquette">${echapper(e)}</span>`)
        .join('')}</p>`;
    }
  }

  // Marchés du contenu, s'il en porte : un lien vers leur page
  // d'atterrissage, qui aide autant le lecteur que le maillage interne.
  const marchesPage = MARCHES_PUBLIES.filter(
    (m) => Array.isArray(page.marches) && page.marches.includes(m.code)
  );
  const lienMarches = marchesPage.length
    ? `<p>Ce contenu concerne ${marchesPage
        .map((m) => `<a href="${SITE}/${m.code}">${echapper(motMarche(m))}</a>`)
        .join(', ')}.</p>`
    : '';

  const corps = `
<nav class="fil"><a href="${SITE}/">Accueil</a> › <a href="${SITE}/${rubrique}">${echapper(
    conf.titre
  )}</a></nav>
<h1>${echapper(page.titre)}</h1>
<p class="chapo">${echapper(page.description_courte || '')}</p>
${markdownVersHtml(page.contenu_long)}
${complement}
<div class="actions">${actions.join('')}</div>
<footer>
${lienMarches}
Publié sur <a href="${SITE}/">PiloTerra</a>, portail IA open source édité par <a href="https://bziiit.com">bziiit</a>.
</footer>`;

  return gabarit({
    titre: page.seo_title || page.titre,
    description: page.seo_description || page.description_courte || '',
    url,
    corps,
    schemas: [jsonLd(page, url), filAriane(rubrique, page, url)]
  });
}

function pageRubrique(rubrique, pages) {
  const conf = RUBRIQUES[rubrique];
  const url = `${SITE}/${rubrique}`;

  const items = pages
    .map(
      (p) => `<li>
  <a href="${SITE}${p.url_path}">${echapper(p.titre)}</a>
  <p>${echapper(tronquer(p.seo_description || p.description_courte || '', 180))}</p>
</li>`
    )
    .join('\n');

  const corps = `
<nav class="fil"><a href="${SITE}/">Accueil</a> › ${echapper(conf.titre)}</nav>
<h1>${echapper(conf.titre)}</h1>
<p class="chapo">${echapper(conf.intro)}</p>
<ul class="liste-rubrique">
${items}
</ul>
<div class="actions"><a class="bouton" href="${SITE}/${conf.ancre}">Ouvrir le portail</a></div>
${(() => {
  const avecCetteRubrique = MARCHES_PUBLIES.filter((m) =>
    (RUBRIQUES_PAR_MARCHE[m.code] || []).includes(rubrique)
  );
  if (avecCetteRubrique.length < 2) return '';
  return `<p class="etiquettes">Par marché : ${avecCetteRubrique
    .map(
      (m) => `<a class="etiquette" href="${SITE}/${m.code}/${rubrique}">${echapper(m.libelle)}</a>`
    )
    .join('')}</p>`;
})()}
<footer>
<a href="${SITE}/">PiloTerra</a>, portail IA open source édité par <a href="https://bziiit.com">bziiit</a>.
</footer>`;

  return gabarit({
    titre: `${conf.titre} | PiloTerra`,
    description: conf.intro,
    url,
    corps,
    schemas: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: conf.titre,
        description: tronquer(conf.intro, 300),
        url
      }
    ]
  });
}

/* ------------------------------------------------------------------ */
/* Pages par marché (étape 8)                                          */
/* ------------------------------------------------------------------ */

/** Lien vers le portail, ouvert sur le bon marché. */
const lienPortailMarche = (marche, ancre = '') => `${SITE}/?marche=${marche.code}${ancre}`;

/**
 * Page d'atterrissage d'un marché : /<code>.
 * Elle donne la promesse du marché, ses publics, puis un aperçu de chaque
 * rubrique avec le lien vers la rubrique complète du marché.
 */
function pageMarche(marche, parRubriqueDuMarche) {
  const url = `${SITE}/${marche.code}`;
  const titre = marche.seo_titre || `${marche.libelle} : l'IA open source, outil par outil`;
  const intro = marche.seo_intro || marche.baseline || '';

  const publics = Array.isArray(marche.publics) ? marche.publics : [];
  const blocPublics = publics.length
    ? `<h2>À qui s'adresse ce portail</h2>
<p>${echapper(marche.publics_intro || '')}</p>
<ul>${publics.map((p) => `<li>${echapper(p.libelle || '')}</li>`).join('')}</ul>`
    : '';

  const blocs = Object.entries(parRubriqueDuMarche)
    .filter(([, liste]) => liste.length)
    .map(([rubrique, liste]) => {
      const conf = RUBRIQUES[rubrique];
      const items = liste
        .slice(0, 8)
        .map(
          (p) => `<li>
  <a href="${SITE}${p.url_path}">${echapper(p.titre)}</a>
  <p>${echapper(tronquer(p.seo_description || p.description_courte || '', 180))}</p>
</li>`
        )
        .join('\n');
      const suite =
        liste.length > 8
          ? `<p><a href="${SITE}/${marche.code}/${rubrique}">Voir les ${liste.length} ${echapper(
              conf.nom.toLowerCase()
            )}</a></p>`
          : `<p><a href="${SITE}/${marche.code}/${rubrique}">${echapper(conf.nom)} pour ${echapper(
              motMarche(marche)
            )}</a></p>`;
      return `<h2>${echapper(conf.nom)}</h2>
<ul class="liste-rubrique">
${items}
</ul>
${suite}`;
    })
    .join('\n');

  const autres = MARCHES_PUBLIES.filter((m) => m.code !== marche.code);
  const blocAutres = autres.length
    ? `<p class="etiquettes">Autres marchés : ${autres
        .map((m) => `<a class="etiquette" href="${SITE}/${m.code}">${echapper(m.libelle)}</a>`)
        .join('')}</p>`
    : '';

  const corps = `
<nav class="fil"><a href="${SITE}/">Accueil</a> › ${echapper(marche.libelle)}</nav>
<h1>${echapper(titre)}</h1>
<p class="chapo">${echapper(intro)}</p>
<div class="actions">
  <a class="bouton" href="${lienPortailMarche(marche)}">Ouvrir le portail ${echapper(
    marche.libelle
  )}</a>
  <a class="bouton secondaire" href="${lienPortailMarche(marche, '#defi-ia')}">Lancer un défi IA</a>
</div>
${blocPublics}
${blocs}
${blocAutres}
<footer>
<a href="${SITE}/">PiloTerra</a>, portail IA open source édité par <a href="https://bziiit.com">bziiit</a>,
co-auteur du référentiel AFNOR SPEC 2314 sur l'IA frugale.
</footer>`;

  return gabarit({
    titre: `${titre} | PiloTerra`,
    description: intro,
    url,
    corps,
    accent: marche.couleur_accent,
    schemas: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: titre,
        description: tronquer(intro, 300),
        url
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'PiloTerra', item: SITE },
          { '@type': 'ListItem', position: 2, name: marche.libelle, item: url }
        ]
      }
    ]
  });
}

/** Rubrique d'un marché : /<code>/<rubrique>. */
function pageRubriqueMarche(marche, rubrique, pages) {
  const conf = RUBRIQUES[rubrique];
  const url = `${SITE}/${marche.code}/${rubrique}`;
  const titre = `${conf.nom} pour ${motMarche(marche)}`;
  const intro = `${conf.intro} Cette page ne présente que ce qui concerne ${motMarche(marche)}.`;

  const items = pages
    .map(
      (p) => `<li>
  <a href="${SITE}${p.url_path}">${echapper(p.titre)}</a>
  <p>${echapper(tronquer(p.seo_description || p.description_courte || '', 180))}</p>
</li>`
    )
    .join('\n');

  const corps = `
<nav class="fil"><a href="${SITE}/">Accueil</a> › <a href="${SITE}/${marche.code}">${echapper(
    marche.libelle
  )}</a> › ${echapper(conf.nom)}</nav>
<h1>${echapper(titre)}</h1>
<p class="chapo">${echapper(intro)}</p>
<ul class="liste-rubrique">
${items}
</ul>
<div class="actions">
  <a class="bouton" href="${lienPortailMarche(marche, conf.ancre)}">Ouvrir le portail</a>
  <a class="bouton secondaire" href="${SITE}/${rubrique}">Voir tous les marchés</a>
</div>
<footer>
<a href="${SITE}/">PiloTerra</a>, portail IA open source édité par <a href="https://bziiit.com">bziiit</a>.
</footer>`;

  return gabarit({
    titre: `${titre} | PiloTerra`,
    description: intro,
    url,
    corps,
    accent: marche.couleur_accent,
    schemas: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: titre,
        description: tronquer(intro, 300),
        url
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'PiloTerra', item: SITE },
          { '@type': 'ListItem', position: 2, name: marche.libelle, item: `${SITE}/${marche.code}` },
          { '@type': 'ListItem', position: 3, name: conf.nom, item: url }
        ]
      }
    ]
  });
}

/* ------------------------------------------------------------------ */
/* Sitemap et llms.txt                                                 */
/* ------------------------------------------------------------------ */

function sitemap(pages, rubriquesActives, urlsMarche = []) {
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const entrees = [
    { loc: `${SITE}/`, lastmod: aujourdhui, priority: '1.0' },
    // Pages de marché : portes d'entrée thématiques, prioritaires sur les
    // rubriques tous marchés confondus.
    ...urlsMarche.map((u) => ({ loc: u.loc, lastmod: aujourdhui, priority: u.priority })),
    ...rubriquesActives.map((r) => ({
      loc: `${SITE}/${r}`,
      lastmod: aujourdhui,
      priority: '0.8'
    })),
    ...pages.map((p) => ({
      loc: `${SITE}${p.url_path}`,
      lastmod: String(p.lastmod || aujourdhui).slice(0, 10),
      priority: '0.7'
    }))
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entrees
  .map(
    (e) =>
      `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n    <priority>${e.priority}</priority>\n  </url>`
  )
  .join('\n')}
</urlset>
`;
}

function llmsTxt(parRubrique, marchesAvecPages = []) {
  // Les marchés d'abord : c'est la clé de lecture du portail.
  const blocMarches = marchesAvecPages.length
    ? `## Marchés couverts\n\n${marchesAvecPages
        .map(
          ({ marche, rubriques }) =>
            `- [${marche.libelle}](${SITE}/${marche.code}) : ${tronquer(
              marche.seo_intro || marche.baseline || '',
              160
            )}\n` +
            rubriques
              .map(
                ([rubrique, liste]) =>
                  `  - [${RUBRIQUES[rubrique].nom} pour ${motMarche(marche)}](${SITE}/${
                    marche.code
                  }/${rubrique}) : ${liste.length} contenus`
              )
              .join('\n')
        )
        .join('\n')}`
    : '';

  const blocs = Object.entries(parRubrique).map(([rubrique, pages]) => {
    const conf = RUBRIQUES[rubrique];
    const lignes = pages
      .map(
        (p) =>
          `- [${p.titre}](${SITE}${p.url_path}) : ${tronquer(
            p.seo_description || p.description_courte || '',
            140
          )}`
      )
      .join('\n');
    return `## ${conf.titre}\n\n${conf.intro}\n\n${lignes}`;
  });

  const marchesTexte = marchesAvecPages.length
    ? marchesAvecPages
        .map(({ marche }) => motMarche(marche))
        .join(', ')
        .replace(/, (?=[^,]*$)/, ' et ')
    : "l'agriculture";

  return `# PiloTerra

> Portail IA open source destiné aux professionnels français de ${marchesTexte}. Édité par bziiit, co-auteur du référentiel AFNOR SPEC 2314 sur l'IA frugale.

PiloTerra rassemble des agents IA en démonstration, une bibliothèque de prompts métier, un recensement de sources de données ouvertes et un catalogue de formations. L'approche est celle de l'IA frugale : choisir le modèle adapté à la tâche plutôt que le plus puissant.

${blocMarches ? blocMarches + '\n\n' : ''}${blocs.join('\n\n')}

## Contact

Site : ${SITE}
Éditeur : bziiit — https://bziiit.com
`;
}

/* ------------------------------------------------------------------ */
/* Plugin Vite                                                         */
/* ------------------------------------------------------------------ */

export function pluginSeoPiloTerra(options = {}) {
  // Nettoyées une fois : espaces parasites, barre finale de l'URL.
  const supabaseUrl = (options.supabaseUrl || '').trim().replace(/\/+$/, '');
  const supabaseAnonKey = (options.supabaseAnonKey || '').trim();
  let dossierSortie = 'dist';

  return {
    name: 'piloterra-seo',
    apply: 'build',

    configResolved(config) {
      dossierSortie = config.build?.outDir || 'dist';
    },

    async closeBundle() {
      const { mkdir, writeFile, readFile } = await import('node:fs/promises');
      const { join, dirname } = await import('node:path');

      // --- Récupération de l'en-tête de l'application ----------------
      // On reprend TOUT le <head> du index.html produit par Vite, en
      // retirant seulement le titre et la description qu'on remplace.
      // Extraire les balises une à une ne marche pas : les scripts en
      // ligne (config Tailwind, importmap) seraient tronqués et le HTML
      // deviendrait invalide.
      try {
        const indexHtml = await readFile(join(dossierSortie, 'index.html'), 'utf8');
        const enTete = (indexHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i) || [])[1] || '';
        ASSETS_APPLICATION = enTete
          .replace(/<title[\s\S]*?<\/title>/gi, '')
          .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
          // Les chemins relatifs casseraient depuis /agents/mon-agent :
          // on les rend absolus.
          .replace(/(src|href)=("|')\.\//g, '$1=$2/')
          .trim();
      } catch (erreur) {
        console.warn(
          `\n[SEO PiloTerra] index.html illisible (${erreur.message}). ` +
            `Les pages générées seront statiques, sans l'application.\n`
        );
        ASSETS_APPLICATION = '';
      }

      const ecrire = async (cheminRelatif, contenu) => {
        const chemin = join(dossierSortie, cheminRelatif);
        await mkdir(dirname(chemin), { recursive: true });
        await writeFile(chemin, contenu, 'utf8');
      };

      // Sans configuration, on ne génère rien — et on ne retombe surtout
      // sur aucune base par défaut. En production, l'absence de ces
      // variables fait disparaître les pages publiques et le sitemap :
      // l'avertissement doit se lire dans les logs de build.
      if (!supabaseUrl || !supabaseAnonKey) {
        console.warn(
          '\n[SEO PiloTerra] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY absentes. ' +
            'Aucune page publique ni sitemap générés. Le build continue normalement.\n'
        );
        return;
      }

      const entetesSupabase = {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`
      };

      // --- Référentiel des marchés (étape 8) -------------------------
      // Facultatif : sans lui, on génère exactement ce qui existait avant.
      MARCHES = [];
      MARCHES_PUBLIES = [];
      try {
        const reponseMarches = await fetch(
          `${supabaseUrl}/rest/v1/marches?select=code,libelle,baseline,mot_accroche,seo_titre,seo_intro,publics_intro,publics,couleur_accent,ordre&actif=eq.true&order=ordre`,
          { headers: entetesSupabase }
        );
        if (!reponseMarches.ok) throw new Error(`HTTP ${reponseMarches.status}`);
        MARCHES = await reponseMarches.json();
      } catch (erreur) {
        console.warn(
          `\n[SEO PiloTerra] Référentiel des marchés illisible (${erreur.message}). ` +
            `Pages par marché non générées, le reste est inchangé.\n`
        );
        MARCHES = [];
      }

      let pages = [];
      try {
        const reponse = await fetch(
          `${supabaseUrl}/rest/v1/v_seo_pages?select=*&order=lastmod.desc`,
          { headers: entetesSupabase }
        );
        if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
        pages = await reponse.json();
      } catch (erreur) {
        console.warn(
          `\n[SEO PiloTerra] Impossible de joindre Supabase (${erreur.message}). ` +
            `Aucune page publique générée. Le build continue normalement.\n`
        );
        return;
      }

      pages = pages.filter((p) => RUBRIQUES[p.rubrique] && p.slug && p.contenu_long);

      if (!pages.length) {
        console.warn(
          '\n[SEO PiloTerra] Aucune page à générer. ' +
            "Vérifie que seo_indexable est à true et que contenu_long est rempli.\n"
        );
        return;
      }

      const parRubrique = {};
      for (const page of pages) {
        (parRubrique[page.rubrique] ||= []).push(page);
      }

      // --- Découpage par marché (étape 8) ----------------------------
      // Un marché n'a ses pages que s'il est actif — la requête ne ramène
      // que ceux-là — et s'il atteint le seuil de contenus. Les contenus
      // transverses comptent : ils s'affichent sur les trois marchés.
      const contenuParMarche = MARCHES.map((marche) => {
        const retenues = pages.filter((p) => pageDuMarche(p, marche));
        const rubriques = {};
        for (const page of retenues) {
          (rubriques[page.rubrique] ||= []).push(page);
        }
        return { marche, retenues, rubriques };
      }).filter(({ retenues }) => retenues.length >= SEUIL_PAGES_MARCHE);

      MARCHES_PUBLIES = contenuParMarche.map(({ marche }) => marche);
      RUBRIQUES_PAR_MARCHE = Object.fromEntries(
        contenuParMarche.map(({ marche, rubriques }) => [
          marche.code,
          Object.entries(rubriques)
            .filter(([, liste]) => liste.length)
            .map(([rubrique]) => rubrique)
        ])
      );

      const ignores = MARCHES.filter(
        (m) => !MARCHES_PUBLIES.some((publie) => publie.code === m.code)
      );
      if (ignores.length) {
        console.warn(
          `\n[SEO PiloTerra] Marchés sans page, moins de ${SEUIL_PAGES_MARCHE} contenus : ` +
            `${ignores.map((m) => m.code).join(', ')}.\n`
        );
      }

      // Les fiches et rubriques « tous marchés » d'abord : leurs URL ne
      // changent jamais, et elles citent les marchés publiés.
      for (const page of pages) {
        await ecrire(`${page.rubrique}/${page.slug}.html`, pageDetail(page));
      }

      for (const [rubrique, liste] of Object.entries(parRubrique)) {
        await ecrire(`${rubrique}.html`, pageRubrique(rubrique, liste));
      }

      const urlsMarche = [];
      for (const { marche, rubriques } of contenuParMarche) {
        await ecrire(`${marche.code}.html`, pageMarche(marche, rubriques));
        urlsMarche.push({ loc: `${SITE}/${marche.code}`, priority: '0.9' });

        for (const [rubrique, liste] of Object.entries(rubriques)) {
          if (!liste.length) continue;
          await ecrire(`${marche.code}/${rubrique}.html`, pageRubriqueMarche(marche, rubrique, liste));
          urlsMarche.push({ loc: `${SITE}/${marche.code}/${rubrique}`, priority: '0.75' });
        }
      }

      await ecrire('sitemap.xml', sitemap(pages, Object.keys(parRubrique), urlsMarche));
      await ecrire(
        'llms.txt',
        llmsTxt(
          parRubrique,
          contenuParMarche.map(({ marche, rubriques }) => ({
            marche,
            rubriques: Object.entries(rubriques).filter(([, liste]) => liste.length)
          }))
        )
      );

      const detail = Object.entries(parRubrique)
        .map(([r, l]) => `${l.length} ${r}`)
        .join(', ');
      console.log(
        `\n[SEO PiloTerra] ${pages.length} pages générées (${detail}), ` +
          `${Object.keys(parRubrique).length} pages de rubrique, ` +
          `${MARCHES_PUBLIES.length} marchés (${urlsMarche.length} pages), ` +
          `sitemap.xml et llms.txt.\n`
      );
    }
  };
}
