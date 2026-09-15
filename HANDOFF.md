# Bordereau App — État du projet et prochaines étapes

## Objectif du produit

PWA permettant de créer des bordereaux de livraison, bordereaux provisoires
et factures proforma **sur le papier entête réel de l'entreprise**, fourni
tel quel par l'utilisateur (image, PDF ou Word) — jamais recréé ou redessiné.
L'utilisateur ne ressaisit jamais les infos de sa société : elles sont déjà
visibles sur l'image du papier entête. Il ne saisit que ce qui change à
chaque document (type, client, date, articles).

## Stack

- **Backend** : Django 5 + Django REST Framework, Celery + Redis (tâches async),
  WeasyPrint (rendu PDF), PostgreSQL
- **Frontend** : React 18 + TypeScript + Vite, PWA (`vite-plugin-pwa`),
  React Query, React Router, Axios
- **Infra** : Docker Compose (`db`, `redis`, `backend`, `celery`, `frontend`)

## Architecture — flux principal

1. L'utilisateur upload son papier entête une seule fois par société
   (`ingestion` app) → tâche Celery : conversion en image + **détection
   automatique de la zone d'écriture** (où le contenu imprimé s'arrête)
2. Chaque document créé réutilise ce papier entête comme fond de page —
   le contenu (métadonnées + tableau + pied) est positionné dans la zone
   détectée, rendu en PDF via WeasyPrint

## Ce qui est déjà implémenté (fonctionnel, testé)

### Backend
- **`companies`** : modèles `Company`, `Letterhead` (avec `content_top`/`content_bottom`
  en % de la hauteur de page, `header_color` détectée automatiquement — voir
  `ingestion/services/color_detection.py`). Endpoint CRUD `/api/companies/`,
  plus `POST /api/companies/{id}/validate_letterhead/` pour marquer le
  papier entête comme validé (débloque la création de documents pour cette
  société — voir "Fait dans ces sessions")
- **`documents`** : modèles `Document`, `DocumentLine` (avec `unit_price` et
  `is_taxable`, utilisés uniquement par les factures proforma). Endpoint CRUD
  `/api/documents/` (filtrable par `?company=<id>`), génération PDF sur
  `/api/documents/{id}/pdf/` (`documents/services/pdf_render.py`, qui choisit
  le gabarit selon `doc_type` — `document_pdf.html` pour bordereau/provisoire,
  **`document_pdf_proforma.html`** pour les proforma avec calcul HT/TTC/TVA/AIB
  via `documents/services/proforma_calc.py`, voir section dédiée plus bas —
  retourne 400 propre si la société n'a pas encore de letterhead). Le champ
  `number` est **auto-généré** côté serveur (`DocumentViewSet.perform_create`,
  séquence par `company` + `doc_type`, verrouillée via `select_for_update`
  pour éviter les doublons en cas de créations concurrentes) — il n'est plus
  saisi par le client. Le champ `company` du serializer est restreint aux
  sociétés de l'utilisateur courant (empêche de créer un document sur la
  société d'un autre utilisateur)
- **`catalog`** : modèle `Article` (catalogue réutilisable). Endpoint `/api/catalog/articles/`
  (filtrable par `?company=<id>`), même restriction de `company` que `documents`
- **`ingestion`** : conversion de fichier (`services/convert_to_image.py` — image/PDF/docx
  → image via LibreOffice headless + pdf2image) et **détection automatique de zone**
  (`services/zone_detection.py` — analyse des lignes de pixels par seuil d'encre).
  **Testée avec succès sur le vrai papier entête OLADOKOUN ET FILS** : détecte
  correctement la limite à 20.9% de la hauteur de page, juste sous le séparateur.
  Tâche Celery `ingestion/tasks.py::process_letterhead`
- **`accounts`** : inscription (`POST /api/auth/register/`), login JWT
  (`POST /api/auth/token/`), refresh (`POST /api/auth/token/refresh/`),
  utilisateur courant (`GET /api/auth/me/`). Utilise l'email comme identifiant
  (stocké dans le champ `username` du modèle `User` standard Django).
  Testé de bout en bout via curl (register → token → me → refresh)

### Frontend
- Routing avec React Router, `AuthContext` (login/register/logout, stockage
  des tokens dans localStorage), `RequireAuth` (route element avec `Outlet`)
  protège les routes privées (`/`, `/company/new`, `/onboarding/:companyId`,
  `/documents/*`) et redirige vers `/login` sinon
- **UI habillée** : `src/styles.css` (design system CSS simple — variables
  de couleur/espacement, formulaires, boutons, tableaux, cartes ; pas de
  librairie externe) importé dans `main.tsx`. `components/AppShell.tsx`
  (en-tête + nav + déconnexion) enveloppe toutes les routes protégées dans
  `App.tsx`. Toutes les pages (login → inscription → société → entête →
  liste/édition de documents) utilisent ces classes — voir "Fait dans cette
  session" pour le détail
- `api/client.ts` : intercepteur Axios qui **rafraîchit automatiquement**
  le token expiré (retry transparent de la requête d'origine, déconnexion
  si le refresh échoue)
- Pages : `LoginPage`, `RegisterPage` (redirige vers `/company/new` après
  inscription), `CompanyCreatePage` (formulaire nom de société →
  `/onboarding/:companyId`), `OnboardingPage` (upload letterhead pour la
  société créée), `DocumentListPage` (liste, liens vers l'édition), `DocumentEditorPage`
  (création/édition : type/client/date/lieu/objet, tableau de lignes éditable avec
  auto-complétion depuis le catalogue via `<datalist>`, bouton "Générer le PDF".
  **Colonnes du tableau adaptées au type de document** : bordereau/provisoire
  gardent désignation/unité/référence/quantité/observation ; proforma ajoute
  colonnes `PU` et `Taxable` (checkbox) — mêmes champs `client`/`date`/`objet`
  pour les trois types, seul le tableau de lignes change)

### Infra / corrections déjà appliquées (ne pas refaire)
- `docker-compose.yml` : port PostgreSQL mappé sur l'hôte en `5433:5432`
  (conflit avec un Postgres local existant)
- Volumes `./backend:/app:z` et `./frontend:/app:z` (suffixe `:z` requis
  pour SELinux sur la machine de dev, sinon `Permission denied`)
- `backend/Dockerfile` : paquet `libgdk-pixbuf-2.0-0` (renommé depuis
  `libgdk-pixbuf2.0-0` dans Debian trixie)
- `backend/requirements.txt` : `numpy` ajouté (oublié initialement, utilisé
  par `zone_detection.py`), `num2words` ajouté (montant en toutes lettres sur
  la facture proforma) — **rebuild requis** (`docker compose build backend celery`)
  à chaque fois que `requirements.txt` change, sinon le code tourne avec les
  anciennes dépendances (piège déjà rencontré avec `pydyf`, voir plus bas)
- Migrations `companies`, `documents`, `catalog` **n'existaient pas du tout**
  (dossiers `migrations/` vides, même sans `__init__.py`) — les tables
  n'étaient jamais créées en base malgré ce document. Généré et appliqué
  via `makemigrations <app>` + `migrate`
- `OnboardingPage.tsx` appelait `/api/companies/{id}/letterhead/` (404) au
  lieu de `/api/ingestion/companies/{id}/letterhead/` (route réelle définie
  dans `ingestion/urls.py`) — corrigé
- `catalog/urls.py` enregistrait le router sur `""` au lieu de `"articles"` :
  l'endpoint réel était `/api/catalog/` (404 sur `/api/catalog/articles/`,
  pourtant le chemin documenté ici et utilisé par le frontend) — corrigé
- `weasyprint==62.*` cassait à l'exécution (`AttributeError: 'super' object
  has no attribute 'transform'`) car `pydyf` n'était pas épinglé et résolvait
  vers 0.12.x, incompatible avec weasyprint 62.x. Épinglé `pydyf==0.11.*`
  dans `requirements.txt` — **il faut rebuild les images `backend`/`celery`**
  après un `git pull` qui touche ce fichier (`docker compose build backend celery`)
- Le serializer `Document` ne gérait pas la mise à jour des `lines` imbriquées
  (le `ModelSerializer.update()` par défaut plante sur un champ nested
  writable) — `create`/`update` réécrits pour remplacer les lignes à chaque
  sauvegarde
- **Le PDF généré n'affichait jamais le papier entête**, deux bugs cumulés :
  1. `ingestion/services/convert_to_image.py` (conversion docx→pdf via
     LibreOffice) cherchait le PDF converti à `<stem de output_path>.pdf`,
     mais LibreOffice écrit le fichier d'après le **nom du fichier source**
     (`<stem de source_path>.pdf`) — la tâche Celery `process_letterhead`
     échouait donc systématiquement pour tout upload `.docx`/`.doc`
     (silencieusement : l'utilisateur ne voit pas l'échec, `background_image`
     reste juste vide). Corrigé, + suppression du PDF intermédiaire après usage
  2. `documents/services/pdf_render.py` appelait `HTML(string=html_string)`
     **sans `base_url`**, avec `background_url = letterhead.background_image.url`
     qui est une URL relative (`/media/...`) — WeasyPrint ne pouvait pas la
     résoudre et affichait juste... rien, sans erreur. Corrigé en construisant
     une URL `file://<chemin local>` directement (fonctionne avec
     `STORAGE_BACKEND=local` ; à revoir si passage à S3/R2, cf. points
     d'attention techniques)
  3. **Le celery worker n'était pas démarré** une bonne partie de la session
     précédente (`docker-compose.yml` le liste mais rien ne garantit qu'il
     tourne) — toute image de fond uploadée pendant qu'il était éteint reste
     avec `background_image` vide jusqu'à ce que la tâche soit relancée. Si un
     bordereau généré n'a pas d'entête, vérifier d'abord `docker compose ps`
     (le worker `celery` doit être `Up`) avant de chercher plus loin
  4. Une fois l'entête affiché (papier ADJE réel), le contenu du document
     chevauchait quand même le bloc d'infos de l'entête. Diagnostic initial
     erroné (imprécision de `zone_detection.py`) — la vraie cause :
     **`documents/document_pdf.html` rend `{{ content_top }}` localisé en
     français** (`USE_I18N=True`, `LANGUAGE_CODE="fr-fr"`), donc `19.3`
     devient `top: 19,3%` — **virgule invalide en CSS**, la propriété est
     ignorée et `.content` retombe à sa position par défaut (haut de page),
     d'où le chevauchement quel que soit le contenu réel de l'entête. Piège
     silencieux : `top: 50%` (entier, pas de virgule) "marche" par accident,
     ce qui a fait perdre du temps au diagnostic. Corrigé en formatant
     `content_top`/`content_bottom` en `str` (point, jamais virgule) côté
     Python avant de les passer au template — **toute valeur numérique
     injectée dans du CSS/JS depuis un template Django doit passer par ce
     même garde-fou**, la localisation reste correcte (et voulue) pour du
     texte affiché (ex: quantités "1,00")

## Fait dans ces sessions (2026-09-14 → 2026-09-15)

- **Auth bout en bout, backend + frontend** : rien de tout ça n'existait
  vraiment malgré ce que disait ce document (ni `accounts/` côté backend,
  ni `AuthContext`/`LoginPage`/`RegisterPage`/`RequireAuth` côté frontend).
  Construit et testé (curl + `tsc -b`) : inscription, login JWT, refresh
  automatique, route protégée
- **Écran "créer ma société"** (`CompanyCreatePage.tsx`) : formulaire
  `name` → `POST /api/companies/` → redirige vers `/onboarding/:companyId`.
  Flux complet câblé : inscription → `/company/new` → `/onboarding/:companyId`
  → upload letterhead → `/` (liste des documents)
- Corrections découvertes en testant ce flux : migrations manquantes pour
  `companies`/`documents`/`catalog`, URL d'upload du letterhead incorrecte
  côté frontend (voir section infra ci-dessus)
- **Formulaire de création/édition de document** (`DocumentEditorPage.tsx`) :
  type/client/date/lieu/objet, tableau de lignes éditable (ajout/suppression),
  auto-complétion depuis le catalogue (`<datalist>`, remplit unité/référence
  au choix d'une désignation connue), bouton "Générer le PDF" (télécharge le
  PDF, affiche un message propre si la société n'a pas encore de letterhead).
  Numérotation automatique implémentée côté backend (séquence par société +
  type). `DocumentListPage` relie maintenant chaque ligne vers l'édition
- Corrections découvertes en testant ce flux : URL du catalogue cassée
  (`/api/catalog/articles/` → 404), bug WeasyPrint/pydyf, serializer
  `Document` qui ne gérait pas l'update des lignes (voir section infra)
- Testé de bout en bout via curl à travers le proxy Vite (création,
  modification des lignes, génération PDF, filtrage par société) + `tsc -b`
- **Bug signalé par l'utilisateur (1/2)** : bordereau généré sans le papier
  entête en fond. Deux causes trouvées et corrigées (conversion docx→pdf qui
  cherchait le mauvais fichier + `base_url` manquant dans WeasyPrint), voir
  section infra ci-dessus. Le celery worker a aussi été redémarré pour
  appliquer le fix
- **Bug signalé par l'utilisateur (2/2)** : entête affiché mais chevauché par
  le contenu. Cause réelle : localisation Django qui rend `19.3` en `19,3`
  dans le CSS généré (voir point 4 de la section infra ci-dessus — piège à
  connaître pour toute future valeur numérique injectée dans du CSS depuis un
  template). Vérifié en régénérant le PDF du document réel de l'utilisateur
  (société ADJE & SALIOU & FILS, bordereau n°1) — l'entête s'affiche et le
  contenu démarre proprement en dessous, sans chevauchement
- **Gabarit `document_pdf.html` aligné sur un vrai bordereau signé (OLADOKOUN)**
  fourni par l'utilisateur en référence :
  - Date d'émission alignée à droite, en italique, sans virgule
    (`{{ document.issued_place }} le {{ date|date:"d/m/Y" }}`)
  - Labels `OBJET :` et `CLIENT :` soulignés (juste le label, pas la valeur)
  - **Fond du header de tableau = couleur dominante détectée sur l'entête**
    (nouveau : `ingestion/services/color_detection.py::detect_dominant_color`,
    heuristique similaire à `zone_detection.py` — quantifie l'image en 16
    couleurs, écarte le blanc/gris/noir, garde la plus fréquente restante).
    Nouveau champ `Letterhead.header_color` (migration `companies.0002`),
    rempli par la tâche Celery `process_letterhead` en même temps que la
    zone. Couleur du texte du header calculée automatiquement (noir/blanc
    selon la luminance) pour rester lisible quelle que soit la couleur
    détectée (`readable_text_color`)
  - Numéros de ligne en 2 chiffres (`01`, `02`, ..., `26`) via le filtre
    template `stringformat:"02d"` (pas de risque de virgule localisée, ce
    filtre ne passe pas par le formattage nombre de Django)
  - Quantités affichées en partie entière seulement (`1`, `10`, pas `1,00`)
    via `floatformat:"0"`
  - Pied de page `Réceptionnaire` / `Livreur` (gras souligné, `.signatures`
    en flex space-between) + `.signature-space` (30mm vides) pour la
    signature/le cachet manuscrits après impression
  - **`.footer-mask`** : si `letterhead.content_bottom` est détecté (pied de
    page imprimé sur le papier entête original, ex: "La Directrice" + nom
    sur le papier ADJE), un rectangle blanc couvre tout ce qui est en dessous
    — **on ne garde que le haut du papier entête**, le bas est entièrement
    géré par le contenu généré (`Réceptionnaire`/`Livreur` + nom facultatif)
    plutôt que par ce qui était imprimé à l'origine sur le fichier uploadé
  - Nouveau champ **facultatif** `Document.signatory_name` ("nom du gérant
    ou de la directrice", migration `documents.0002`) : affiché en gras,
    aligné sous `Livreur`, juste après l'espace de signature — **seulement
    si renseigné** (`{% if document.signatory_name %}`). Champ ajouté au
    formulaire `DocumentEditorPage.tsx` (facultatif, sous "Objet"). Premier
    essai : je l'avais mis à la place de `Réceptionnaire`/`Livreur` plutôt
    qu'en complément — corrigé après retour de l'utilisateur
  - **Les letterheads déjà uploadés avant ce changement ont `header_color`
    par défaut (`#eeeeee`)** — il faut relancer `process_letterhead` pour
    eux (recréer l'upload, ou `process_letterhead.delay(<id>)` en shell)
    pour qu'ils récupèrent une couleur détectée
- **Facture proforma, gabarit dédié**, aligné sur une vraie facture proforma
  OLADOKOUN fournie en référence — colonnes N°/Réf/Désignation/Unité/
  Quantité/PU/Montant, regroupement produits taxables/non taxables, TVA,
  AIB et montant en toutes lettres. Détail :
  - Nouveau champ `DocumentLine.is_taxable` (migration `documents.0003`) —
    coche si la ligne est un produit taxable (TVA 18%, prix saisi **en TTC**)
    ou non taxable (prix saisi en HT)
  - **`documents/services/proforma_calc.py::compute_proforma_totals`** fait
    tous les calculs en `Decimal` côté serveur (jamais dans le template, pour
    éviter tout arrondi ou souci de formatage) : montant par ligne
    (quantité × PU), regroupement par `is_taxable`, TVA extraite du TTC
    taxable (`TTC - TTC/1.18`, PAS un HT+TVA classique — les lignes taxables
    sont saisies TTC), Total HT Général = non-taxables HT + taxables HT,
    AIB = 1% du Total HT Général, **TOTAL TTC Général = non-taxables HT +
    taxables TTC (l'AIB n'est PAS rajoutée — c'est une retenue à la source,
    pas un supplément facturé)**. Logique entièrement reconstituée et
    vérifiée ligne à ligne contre la référence OLADOKOUN (tous les montants
    correspondent exactement)
  - Montant en toutes lettres via `num2words(..., lang="fr")` (nouvelle
    dépendance, voir section infra) — donne bien "deux millions huit cent
    dix mille" pour 2 810 000, identique à la référence
  - Nouveau gabarit `templates/documents/document_pdf_proforma.html` :
    date au format "Parakou, le 04 septembre 2026" (avec virgule, mois en
    toutes lettres — **différent du format bordereau**, chaque type de
    document a son propre format daté sur sa propre référence réelle),
    `CLIENT :` en gras (pas souligné, contrairement au bordereau), `Objet :`
    en gras avec valeur en italique, lignes groupées sous des en-têtes de
    section colorées, lignes de totaux coloriées (même `header_color` que
    l'entête du tableau), signature "Le Gérant" (pas "Réceptionnaire"/
    "Livreur") + nom facultatif en dessous
  - `pdf_render.py` choisit maintenant le gabarit et le contexte selon
    `document.doc_type` (`_letterhead_context` factorisé, partagé par les
    deux gabarits)
  - Frontend : `DocumentEditorPage.tsx` affiche les colonnes `PU` et
    `Taxable` (checkbox) dans le tableau de lignes **uniquement** quand
    `doc_type === "proforma"` — bordereau/provisoire gardent le tableau
    simple existant, mêmes champs de métadonnées (client/date/objet/lieu)
    pour les trois types de document, seul le tableau de lignes change.
    L'autocomplétion catalogue préremplit aussi le PU depuis
    `Article.default_price` quand disponible
  - Vérifié en reconstruisant les montants exacts de la référence PDF via
    Django shell (tous les totaux correspondent au centime près), puis via
    l'API à travers le proxy Vite avec le payload exact envoyé par le
    formulaire
  - Ajustements visuels suite à retours utilisateur : lignes de totaux sans
    fond (le fond plein est réservé au header de tableau), sections
    "Produits taxables"/"non taxables" en `header_color` à 30% d'opacité
    (nouvelle fonction `color_detection.py::with_opacity`), colonne
    Observation masquée dans le formulaire pour les proforma (elle n'existe
    pas dans ce gabarit)
- **Habillage visuel de toute l'app**, de l'inscription au téléchargement du
  PDF — jusque-là chaque page était du HTML brut sans aucun style :
  - `src/styles.css` : petit design system en CSS simple (pas de
    dépendance externe) — variables de couleur (vert `#1d9e75`, repris du
    `theme_color` du manifest PWA), boutons (primaire/secondaire/danger),
    champs de formulaire, cartes, tableaux, badges, états vides/chargement
  - `components/AppShell.tsx` : en-tête commun (nom de l'app, email de
    l'utilisateur, déconnexion) qui enveloppe désormais toutes les routes
    protégées dans `App.tsx` — la déconnexion n'est plus seulement sur
    `DocumentListPage`, elle est accessible partout
  - Toutes les pages restylées : `LoginPage`/`RegisterPage` (carte centrée),
    `CompanyCreatePage`/`OnboardingPage` (indicateur "Étape X sur 3",
    `OnboardingPage` a une vraie zone de dépôt de fichier avec retour visuel
    du fichier choisi), `DocumentListPage` (états vide/chargement, type de
    document en badge via nouveau `docTypes.ts` partagé),
    `DocumentEditorPage` (champs regroupés en carte, tableau de lignes dans
    un conteneur scrollable en cas de débordement horizontal)
  - **Emplacements ajoutés pour les imports pas encore implémentés** (points
    2 et 3 ci-dessous) : deux encarts "Importer un fichier (CSV/Excel)" et
    "Importer par photo/scan (OCR)" sous le tableau de lignes de
    `DocumentEditorPage`, avec badge "Bientôt" — visuellement présents mais
    non cliquables (pas de logique derrière), pour que l'emplacement soit
    prêt le jour où ces imports seront branchés
  - Vérifié : `tsc -b` sans erreur, logs Vite sans erreur HMR, `index.html`
    et `src/styles.css` répondent 200
- **Refonte visuelle complète** de l'inscription au téléchargement du PDF,
  sur la base d'une maquette de référence fournie par l'utilisateur (style
  "Verto" — police mono, fond pointillé, cartes inclinées) :
  - Police `JetBrains Mono` (Google Fonts, chargée dans `index.html`) sur
    toute l'app, palette noir/blanc/vert (`--color-accent`) + bleu pour les
    badges de type de document, fond pointillé en CSS pur (`radial-gradient`
    répété), boutons pilule, cartes à coins arrondis avec ombre douce.
    Tout dans `src/styles.css`, pas de framework CSS externe
  - **Nouvelle page d'accueil publique** (`features/home/HomePage.tsx`) sur
    `/` — accroche + CTA "Mes documents", cartes de documents (bordereau,
    facture proforma, papier entête) légèrement inclinées façon maquette de
    référence (pur CSS/HTML, pas de vraies captures de PDF). **La liste des
    documents a déménagé de `/` vers `/documents`** — tous les
    `navigate("/")` internes mis à jour en conséquence (`OnboardingPage`,
    fallback de redirection post-login dans `LoginPage`)
  - **En-tête simplifié** (`AppShell.tsx`) : `B&F` à gauche, à droite un
    bouton avatar (initiales) qui ouvre un petit menu affichant nom complet
    et email, et une icône de déconnexion séparée
  - **Prénom/nom ajoutés à l'inscription** — le modèle `User` standard
    Django les a déjà nativement (aucune migration nécessaire), juste
    branché : `RegisterSerializer`/`UserSerializer` (backend),
    `RegisterPage.tsx` + `AuthContext` (frontend)
  - **Icônes partout** via `lucide-react` (nouvelle dépendance npm) :
    corbeille pour supprimer une ligne, `+` pour en ajouter, disquette pour
    enregistrer, téléchargement pour générer le PDF, icônes dans les encarts
    d'import. Classe utilitaire `.btn-icon-collapsible` + `<span
    className="btn-label">` : le libellé texte se masque sous 640px de large
    (mobile) pour ne garder que l'icône, réapparaît au-dessus
  - Marges latérales augmentées (`.app-main`/`.landing-hero`
    `padding`/`max-width` revus) pour plus de respiration sur les grands
    écrans
  - `npm install` relancé dans le conteneur `frontend` pour `lucide-react`
    (volume `node_modules` anonyme — **si le conteneur est recréé sans
    rebuild d'image, relancer `npm install`**, ou ajouter un rebuild d'image
    comme pour les dépendances Python)
  - **Non vérifié visuellement** : aucun outil de capture de navigateur
    disponible dans cet environnement — vérifié uniquement via `tsc -b`,
    logs Vite (pas d'erreur HMR), et tests bout en bout de l'inscription
    avec prénom/nom via curl. À valider dans un vrai navigateur avant de
    considérer le rendu final acquis
- **Navigation multi-société** — le modèle supportait déjà plusieurs
  sociétés par utilisateur (`Company.owner` en FK simple), mais rien côté
  UI ne permettait d'en ajouter une 2ᵉ ni de choisir laquelle utiliser une
  fois l'onboarding initial passé. Entièrement frontend, aucun changement
  backend (les filtres `?company=` sur `/api/documents/` et
  `/api/catalog/articles/` existaient déjà) :
  - Navbar dans `AppShell.tsx` : "Mes documents" / "Mes entreprises"
    (`NavLink`, style actif réutilisant les tokens existants)
  - **`CompanyListPage.tsx`** (nouvelle, route `/companies`) : cartes par
    société avec statut du papier entête (badge vert "validé" / orange "en
    attente" / rouge "aucun papier entête" — nouvelles classes
    `.status-badge--*`, même langage visuel que les badges existants), lien
    "Voir ses documents" vers `/documents?company={id}`, bouton "+ Nouvelle
    entreprise"
  - **`DocumentListPage.tsx`** : select de filtre par société **reflété
    dans l'URL** (`useSearchParams`, pas juste un state local — un lien
    `/documents?company=3` est donc partageable/bookmarkable), badge nom de
    société sur chaque ligne (en plus du badge type déjà existant), tri
    client par `issued_at` décroissant (filet de sécurité, indépendant de
    l'ordre renvoyé par l'API)
  - **`DocumentEditorPage.tsx`**, logique de résolution de société pour un
    nouveau document (uniquement à la création, pas à l'édition) :
    1. `?company=` dans l'URL → utilisée si valide
    2. sinon, une seule société → auto-sélection, aucune friction
    3. sinon (plusieurs sociétés, pas de `?company=`) → **chooser** dédié
       (liste de boutons, nouvelle classe `.company-picker`) avant
       d'afficher le formulaire
    4. dans tous les cas, si `letterhead.is_validated` n'est pas `True`
       (entête manquant ou pas encore validé) → redirection vers
       `/onboarding/{id}` au lieu de laisser créer le document
    Le `<select>` "Société" qui était intégré au formulaire a été retiré
    (la société est maintenant décidée *avant* d'arriver sur le formulaire,
    plus affichée qu'éditée : "Pour {nom de la société}")
  - **Bug trouvé en implémentant** : `LoginPage.tsx` ne restaurait que
    `location.state.from.pathname` après connexion, pas `.search` — un lien
    direct type `/documents?company=3` visité déconnecté perdait son
    `?company=` après le login. Corrigé (`pathname + search`)
  - **Suite immédiate, dans la session** : `Letterhead.is_validated` n'était
    mis à `True` nulle part (signalé à l'utilisateur, qui l'a confirmé en
    testant — plus aucun document ne pouvait être créé). Ajouté
    **`POST /api/companies/{id}/validate_letterhead/`** (action DRF sur
    `CompanyViewSet`, 400 propre si pas de papier entête) + bouton "Valider
    le papier entête" sur la carte `CompanyListPage` quand le statut est
    "en attente" (avec un texte expliquant que c'est le fond généré
    automatiquement, pas encore un aperçu ajustable). **C'est une étape
    minimale, pas l'écran d'ajustement manuel de la zone** (point 1
    ci-dessous, qui reste à faire — il permettra de voir/ajuster
    `content_top`/`content_bottom` avant de valider, plutôt que de valider
    "à l'aveugle")
  - Testé via curl à travers le proxy Vite : société créée avec succès,
    liste `/api/companies/` renvoie bien `letterhead.is_validated`, filtre
    `?company=` sur `/api/documents/` fonctionne, `tsc -b` et
    `manage.py check` passent. Pas de vérification visuelle possible (pas
    d'outil de navigateur dans cet environnement)
- **Numérotation manuelle des documents** (en plus de l'auto-incrément
  existant) et **remplacement du papier entête** d'une société déjà
  onboardée — deux demandes distinctes de l'utilisateur :
  - `Document.number` n'est plus `read_only` dans le serializer : laissé
    vide → auto-incrément inchangé (`DocumentViewSet.perform_create`),
    saisi → utilisé tel quel. **Contrainte DB `unique_together`
    (company, doc_type, number)** ajoutée (migration `documents.0004`) +
    validation explicite dans `DocumentSerializer.validate()` pour un
    message clair en cas de doublon plutôt qu'une `IntegrityError` brute.
    **Piège rencontré** : DRF génère automatiquement un
    `UniqueTogetherValidator` à partir de cette contrainte, qui rend les 3
    champs obligatoires (il lui faut le triplet complet pour vérifier
    l'unicité) — ça cassait l'auto-génération (`number` vide refusé avec
    "Ce champ est obligatoire"). Corrigé avec `Meta.validators = []` pour
    désactiver ce validator auto et ne garder que le mien
  - Champ "Numéro" ajouté à `DocumentEditorPage.tsx` (texte libre, indice
    "Laisse vide pour incrémenter automatiquement"), pré-rempli en édition.
    Un numéro laissé vide en édition ne réécrit pas l'existant (géré dans
    `DocumentSerializer.update()`)
  - **Comportement à documenter/connaître** : l'auto-incrément se base sur
    le `number` de la dernière ligne *créée* (`order_by("-id").first()`),
    pas sur le maximum numérique existant. Si un numéro manuel "saute" en
    avant (ex: 700 alors que l'auto-incrément en était à 501), le prochain
    auto-généré repart de 701, pas de 502 — comportement volontaire (continuité
    chronologique) mais à garder en tête si quelqu'un s'attend à un
    "combler les trous"
  - **Remplacement de papier entête** : `LetterheadUploadView.post` (déjà
    en `update_or_create`, donc remplaçait déjà le fichier) remet
    maintenant explicitement `is_validated=False` dans le `defaults` — sans
    ça, remplacer le fichier d'une société déjà validée gardait l'ancienne
    validation alors que la nouvelle zone détectée n'a jamais été revue.
    Bouton **"Remplacer le papier entête"** ajouté sur `CompanyListPage`
    (visible dès qu'un entête existe, quel que soit son statut).
    `OnboardingPage.tsx` détecte via `GET /api/companies/{id}/` si un
    entête existe déjà et adapte son texte ("Remplacer" vs "Ajoute ton
    papier entête", pas de "Étape 3 sur 3" hors onboarding initial,
    avertit que le remplacement redemande une validation). Redirige
    maintenant vers `/companies` après upload (au lieu de `/documents`) —
    plus logique pour voir tout de suite le nouveau statut "en attente"
  - Testé via curl à travers le proxy Vite : numéro auto, numéro manuel,
    rejet de doublon avec message clair, ré-upload qui remet bien
    `is_validated` à `false`. `tsc -b` et `manage.py check` passent
- **Ajustements UI suite à retours utilisateur** (header + carte société) :
  - **`AppShell.tsx` en-tête sur deux rangées** : `B&F` + menu profil
    ensemble en haut (même ligne), liens "Mes documents"/"Mes entreprises"
    juste en dessous, en permanence (plus seulement en fallback de
    wrap sur petit écran)
  - **Déconnexion déplacée dans le menu profil** : plus d'icône
    séparée toujours visible — le dropdown (clic sur l'avatar) affiche
    maintenant nom + email + un item "Déconnexion" (icône + label,
    `.profile-dropdown__logout`)
  - **`CompanyListPage.tsx`** : le badge de statut du papier entête et son
    action associée ("Ajouter"/"Remplacer", labels courts non tronqués sur
    mobile) sont maintenant sur la même ligne (`.company-card__status-row`).
    "Voir ses documents" devient le **CTA principal** — nouveau style
    `.btn-accent` (vert, fond plein) pour qu'il ressorte visuellement,
    "Valider" repassé en bouton secondaire discret
  - Nouvelles classes CSS : `.btn-accent`, `.btn-compact`,
    `.company-card__status-row`, `.profile-dropdown__logout` — tout basé
    sur les tokens de couleur/rayon déjà en place, rien de nouveau ajouté
    au design system
  - `tsc -b` et `manage.py check` passent, logs Vite propres. Toujours pas
    de vérification visuelle possible (pas d'outil de navigateur)
- **Correction d'un malentendu + deux fonctionnalités** : l'utilisateur
  pensait que l'historique des documents n'était pas conservé — en fait si
  (chaque document est en base, listé sur "Mes documents", ré-éditable et
  re-téléchargeable à tout moment). Clarifié, puis demande précisée en deux
  vrais trous, confirmés par l'utilisateur :
  - **Dupliquer un document** : `POST /api/documents/{id}/duplicate/` —
    copie société/type/client/objet/lignes, **nouveau numéro auto**, date
    du jour, statut `draft`. Bouton "Dupliquer" dans `DocumentEditorPage.tsx`
    (visible dès qu'un document existe), redirige vers l'édition de la copie
  - **PDF archivé (copie figée)** : le champ `generated_pdf` existait sur
    `Document` mais n'était jamais rempli — chaque téléchargement
    régénérait à la volée depuis les données actuelles. Ajouté
    **`POST /api/documents/{id}/finalize/`** : rend le PDF, le sauvegarde
    dans `generated_pdf`, passe `status` à `final`. `Document.status`
    (existait déjà, jamais utilisé jusqu'ici) devient **read-only côté
    serializer** — seule l'action `finalize` peut le faire passer à `final`,
    pour ne jamais se retrouver avec `status=final` sans PDF archivé
    correspondant
  - **Comportement de `GET /api/documents/{id}/pdf/`** : si `status=final`
    et qu'un PDF est archivé → sert ce fichier tel quel (jamais régénéré,
    même si le document ou le papier entête changent après coup). Sinon →
    comportement inchangé (régénère à la volée, utile pendant qu'on
    modifie encore un brouillon)
  - **Modifier un document finalisé le repasse automatiquement en
    `draft`** (`DocumentSerializer.update()`) — le PDF archivé ne
    correspondrait plus aux données, donc le statut ne ment pas ; il faut
    re-cliquer "Finaliser" pour figer une nouvelle copie
  - Frontend : badge "Finalisé" à côté du titre, bouton "Finaliser"
    (visible seulement si `draft`), libellé du bouton PDF qui devient
    "Télécharger le PDF" (au lieu de "Générer le PDF") une fois finalisé,
    message explicatif sous les actions quand le document est finalisé
  - Testé via curl à travers le proxy Vite : create → finalize (statut +
    PDF archivé confirmés) → patch (repasse bien en `draft`) → duplicate
    (nouveau numéro, date du jour, lignes copiées). `tsc -b` et
    `manage.py check` passent
- **Couleur d'accent changée** (vert vif → vert sombre tendant vers le
  noir, sur demande) : `--color-accent: #1b3a2a`, `--color-accent-dark:
  #0f2419`. Badges "validé"/statut ok retravaillés pour rester en
  cohérence avec ce nouveau vert sombre plutôt que de garder l'ancien vert
  pastel `#e9f9ee` qui ne s'harmonisait plus — nouveau token
  `--color-accent-bg: #dde6e0` (fond clair dérivé du même vert) partagé
  par `.status-badge--ok` et `.mockup-card__badge`
- **Nouveau gabarit de ligne dans "Mes documents"** (`DocumentListPage.tsx`) :
  société à gauche / badge type de document à droite sur une même rangée
  (tronqué avec ellipsis si le nom est trop long, `min-width:0` nécessaire
  sur le flex item sinon l'ellipsis ne s'applique pas), numéro + **date de
  création** (`created_at`, pas `issued_at`) en dessous. Le client n'est
  plus affiché dans la liste (pas demandé dans le nouveau gabarit — toujours
  visible en ouvrant le document)
  - **Couleurs légèrement différentes par type** : nouveaux tokens
    `--color-type-bordereau`/`-provisoire`/`-proforma` (bleu / violet /
    teal — proches mais distincts), classes `.doc-list__type--{doc_type}`
  - **Labels abrégés** pour le badge ("Bordereau" / "Provisoire" /
    "Proforma" au lieu de "Bordereau de livraison" etc.) — nouveau
    `docTypeShortLabel()` dans `docTypes.ts`, à côté de `docTypeLabel()`
    (toujours utilisé pour le `<select>` du formulaire, qui garde le texte
    complet)
  - `tsc -b` et `manage.py check` passent

## Ce qui N'EST PAS fait — actions à mener, dans cet ordre de priorité

### 1. Écran d'ajustement manuel de la zone détectée
Le backend renvoie `content_top`/`content_bottom` mais rien côté frontend
n'affiche l'aperçu avec la ligne ajustable. À faire :
- Composant qui affiche `letterhead.background_image` avec une ligne
  horizontale positionnée à `content_top`% de la hauteur
- Ligne draggable (mousedown/mousemove) qui `PATCH` la valeur sur
  `Letterhead` au relâchement
- Utile aussi pour `content_bottom` si un pied de page est détecté

### 2. Import CSV/Excel des articles
Pas commencé. Prévoir un endpoint dans `ingestion` qui accepte un fichier
CSV/XLSX et retourne une liste de lignes à valider avant import dans un
document (mapping colonnes → champs `DocumentLine`)

### 3. Import OCR (image/PDF de liste d'articles)
Pas commencé — dernière priorité. Tesseract.js ou service cloud, avec
étape de correction manuelle obligatoire après extraction (voir discussion
précédente sur la fiabilité de l'OCR)

### 4. Tests sur le 2e papier entête (Adje) — pied de page signature
La détection de `content_bottom` (pour éviter d'écrire sur un pied de page
imprimé comme la signature "La Directrice" du fichier Adje) n'a pas encore
été testée en conditions réelles — seul `content_top` a été validé sur
Oladokoun. À vérifier avant de considérer `zone_detection.py` comme fiable.

## Points d'attention techniques

- `zone_detection.py` utilise une heuristique simple (seuil sur le ratio de
  pixels sombres par ligne) — fiable sur fond blanc net avec séparateur
  clair, moins fiable sur fond texturé/filigrane. Documenté dans le code.
- Le login frontend envoie le champ `username` (pas `email`) à
  `/api/auth/token/`, car SimpleJWT utilise `USERNAME_FIELD` du modèle User
  standard — c'est intentionnel, ne pas "corriger" sans changer le modèle User.
- `STORAGE_BACKEND` est en local par défaut (`MEDIA_ROOT`) — passer à S3/R2
  avant toute mise en prod (`.env` a déjà les variables prêtes, commentées).
