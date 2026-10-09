# Extension OneStock – Couverture de stock

Extension UI OneStock pour **lire et mettre à jour les couvertures de stock** (ventes par période par article et
lieu de stock) transmises à OneStock, avec l'API `stock_coverages`.

Elle récupère le contexte OneStock (paramètres d'URL + handshake `extension_ready` / `onestock_data`, cf.
[UI Extensibility](https://onestock.atlassian.net/wiki/spaces/DOCUMENTAT/pages/1691418644/UI+Extensibility+-+How+to+develop+UI+Extensions)) :
`site_id`, `api_url`, `extension_id`, et le cas échéant `item_id(s)` / `endpoint_id(s)` pour pré-remplir la
recherche. Conformément à la demande, **la signature de l'extension n'est pas vérifiée** (pas de sécurité).

Les textes statiques suivent la langue du contexte (`lang`, paramètre d'URL ou `onestock_data`) : français et
anglais dans `src/i18n.ts`, repli sur l'anglais pour les autres langues (ajouter un dictionnaire pour en gérer une
nouvelle). Les messages d'erreur renvoyés par les API (OneStock, Settings) sont affichés tels quels.

## Onglets

| Onglet | Rôle | API OneStock |
| --- | --- | --- |
| **Consulter** | Barre de filtres au format OneStock : Article et Lieu de stock (valeurs multiples, suggestions OneStock pendant la saisie), Assortiment, Couverture. Modification en ligne des ventes / de l'assortiment, saisie des couples sans couverture, export CSV | `GET /stock_coverages`, `POST /stock_coverages` ; suggestions : `GET /items` (`pattern`), `GET /endpoints` |
| **Mettre à jour** | Saisie manuelle (complétion OneStock sur l'article et le lieu de stock de chaque ligne) ou import CSV (`item_id;endpoint_id;sales_per_period;assortment`) ; ≤ 100 lignes : envoi direct, au-delà : import asynchrone par lots de 100. Réinitialisation des couvertures jusqu'à une date (avec confirmation) | `POST /stock_coverages`, `POST /stock_coverage_imports`, `POST /stock_coverage_imports/{id}/stock_coverages`, `PATCH /stock_coverage_imports/{id}`, `PATCH /reset_stock_coverages` |
| **Imports** | Suivi des imports asynchrones (statut, lots, lignes importées / en erreur), actualisation automatique de l'import qui vient d'être envoyé | `GET /stock_coverage_imports`, `GET /stock_coverage_imports/{id}` |
| **Paramètres** | Saisie du token OneStock et de la racine de l'API, lieux de stock par défaut, libellé de la période ; test de connexion | API Settings |

Sans `onestock_token`, l'app s'ouvre directement sur l'onglet Paramètres.

## Architecture (Vercel)

```
navigateur (iframe OneStock)             Vercel
 └─ Vue 3 + design system OneStock ─▶ api/onestock-proxy.js ─▶ API OneStock (routes stock coverage uniquement)
                                      api/settings.js       ─▶ API Settings (lecture / écriture des paramètres)
```

- Le navigateur n'appelle jamais OneStock directement : tous les appels passent par `POST /api/onestock-proxy`
  `{ context, method, path, body }`. Le proxy lit le token dans l'API Settings, ajoute `site_id` et `token` au corps,
  et utilise `POST` + `X-HTTP-Method-Override: GET` pour les routes GET à body.
- Le proxy ne relaie que les routes de couverture de stock listées ci-dessus, plus `GET /items` et `GET /endpoints`
  en lecture pour les suggestions (`lib/onestock.js`) : le token ne peut pas servir à appeler d'autres API depuis le
  navigateur.
- Suggestions : les articles sont cherchés par `GET /items` avec `pattern` (champs indexés du site : id, nom, EAN…).
  `GET /endpoints` n'ayant pas de recherche textuelle, la liste des lieux de stock est chargée une fois (pages de 500)
  et filtrée dans le navigateur sur l'id, le nom et la ville.
- L'URL de l'API est, par ordre de priorité : `onestock_api_root`, celle reçue du contexte (`api_url`), sinon
  `https://{site_id}.api.qualif.onestock-retail.com` (ou `api.onestock-retail.com` en production) ; `/v3` est ajouté
  si aucune version n'est précisée.
- La logique pure (lecture CSV, validation, découpage en lots) est dans `lib/coverage.js`, partagée par le
  navigateur et les tests.

## Paramètres (API Settings)

Les paramètres sont stockés dans l'**API Settings** de l'application Extensions
(`https://extensions-lemon.vercel.app/api/settings`), appelée uniquement par les fonctions Vercel : la clé d'API et
le token déchiffré n'atteignent jamais le navigateur. Un setting est identifié par `key` + `site_id` +
`extension_id` + `environment` ; lecture par priorité site + extension → site + `*` → tous les sites, avec repli
`prod` → `qualif` ; `environment` est déduit de `api_url` ou forcé par `?environment=`.

| Clé | Niveau d'écriture | Rôle |
| --- | --- | --- |
| `onestock_token` 🔒 | site, `*` | Token de l'API OneStock : lu au niveau global s'il y est fourni, sinon **saisi dans l'onglet Paramètres** (chiffré par l'API Settings ; laisser vide conserve la valeur) |
| `onestock_api_root` | site, `*` | Racine de l'API OneStock (sinon URL du contexte) |
| `default_endpoint_ids` | site, extension | Lieux de stock pré-remplis dans la recherche |
| `period_label` | site, extension | Libellé de la période des ventes (affichage ; vide = « période » traduit dans la langue du contexte) |

À la première connexion, les clés non secrètes absentes sont créées avec leur valeur par défaut.

### Variables d'environnement Vercel

| Variable | Valeur |
| --- | --- |
| `SETTINGS_API_KEY` | Clé déclarée dans `SETTINGS_API_KEYS` du projet Extensions (obligatoire) |
| `SETTINGS_ENCRYPTION_KEY` | Même valeur que dans l'application Extensions (déchiffrement local des secrets) |
| `SETTINGS_API_URL` | Par défaut `https://extensions-lemon.vercel.app/api/settings` |
| `EXTENSION_ID` | `extension_id` utilisé hors contexte OneStock (défaut `stock-coverage`) |
| `SETTINGS_ENVIRONMENT` | Environnement par défaut sans `api_url` (défaut `qualif`) |
| `SETTINGS_CACHE_TTL_MS` | Durée du cache des paramètres en ms (défaut `30000`, `0` = sans cache) |

En local, mettre ces variables dans `.env.local` (voir `.env.example`).

## Design system OneStock

Les composants sont importés depuis l'alias `#ds` (`OsTabs`, `OsButton`, `OsInputText`, `OsSelect`, `OsAlert`,
`OsBadge`, `OsCardLayout`…) :

- si `@onestock-public/design-system` est installé, c'est lui qui est utilisé (avec sa CSS) ;
- sinon, `src/ds/fallback` fournit des composants de même nom, mêmes props et mêmes tokens visuels.

Pour installer le vrai paquet (registre Google Artifact Registry) :

```bash
gcloud auth application-default login
npx google-artifactregistry-auth --registry https://europe-west4-npm.pkg.dev/os-tools-abm42i/os-npm-public \
  --scope @onestock-public --repo-config .npmrc
npm install @onestock-public/design-system
```

Sur Vercel, un `.npmrc` qui lit le token depuis une variable d'environnement :

```
@onestock-public:registry=https://europe-west4-npm.pkg.dev/os-tools-abm42i/os-npm-public/
//europe-west4-npm.pkg.dev/os-tools-abm42i/os-npm-public/:_authToken=${NPM_TOKEN}
```

## Développement

```bash
npm install
npm run dev        # Vite + fonctions /api servies localement (pas besoin de la CLI Vercel)
npm test           # tests unitaires (CSV, proxy, API Settings)
npm run typecheck
```

Hors OneStock :
`http://localhost:5173/?site_id=c00&extension_id=stock-coverage&environment=qualif&item_ids=ITEM1,ITEM2&endpoint_ids=main_MC`.

## Déploiement

Importer le dépôt dans Vercel (framework Vite, sortie `dist/`, fonctions `api/`) ou `vercel deploy`, définir
`SETTINGS_API_KEY` (et `SETTINGS_ENCRYPTION_KEY`), puis communiquer l'URL à votre contact OneStock pour déclarer
l'extension (path `/`). `vercel.json` autorise l'affichage en iframe (`frame-ancestors *`).
