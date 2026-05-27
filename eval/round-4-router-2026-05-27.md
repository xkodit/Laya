# Round 4 — V&V de l'architecture de routage (post round-3)

**Date :** 2026-05-27
**Objet :** validation d'une nouvelle architecture qui route les messages entre **Gemini Flash 2.5** (branche économique) et **Sonnet 4.6** (baseline validée par toi en round-3), avec un validateur côté serveur qui supprime les citations fabriquées avant persistance.

Salut Hadi,

Depuis ta V&V de round-3 sur Sonnet, j'ai testé plusieurs modèles moins chers pour rendre la Phase B viable côté coûts (Haiku, Mistral ×2, Gemini Flash, DeepSeek, Grok). Tous ont des limites architecturales sur la discipline de citation (fabrication, mémoire d'entraînement, contamination droit français). Aucun ne remplace Sonnet "as-is".

**Solution architecturale :** un **routeur par tour** qui envoie les messages à risque (longs / situation individuelle / discrimination) vers Sonnet, et les questions générales courtes vers Gemini Flash 2.5. Le coût baisse significativement (~80 % du trafic reste sur le modèle économique) sans sacrifier la qualité sur les cas qui comptent.

Je te demande ton verdict V&V sur les **7 axes du round-3**. Marque OK / MAUVAIS / OK-avec-critique par section, en commentant les cas où tu vois un problème.

---

## Architecture déployée

**Routeur (`lib/chat/router.ts`)** — décision par tour :
- Longueur du message > **150 caractères** → Sonnet
- Marqueurs adversariaux (`enceinte`, `grossesse`, `antidat`, `discrimin`, `harcel`, `licencier sans/pour`, etc.) → Sonnet quelle que soit la longueur
- Sinon → Gemini Flash 2.5

**Validateur de citations (`lib/chat/citations-validator.ts`)** — défense en profondeur :
- Chaque crochet `[Art. X]` / `[Loi …]` / `[Décret …]` est vérifié contre les chunks retournés par `search_labor_code` ce tour
- Les citations non vérifiées sont **strippées** du contenu persisté (les crochets sont retirés, le texte interne reste — ex : `[Art. 13.1]` → texte brut `Art. 13.1`, plus de badge cliquable)

**Liste corpus dans le prompt système** — prévention en amont :
- Les 6 documents du corpus sont listés explicitement dans le prompt
- Décret n° 96-287 sur le contrat de travail est nommé comme contre-exemple (Gemini l'a fabriqué sur Q4 ; cette règle empêche la récidive)

**Commits concernés :** `d6ac6be` (routeur + validateur strip), `35188ca` (liste corpus + Décret 96-287 anti-exemple), `2fd863b` (revert des règles round-3 qui avaient cassé Gemini).

---

## Les 7 axes round-3 — re-testés sur la nouvelle architecture

Pour chaque axe : la question, le routage observé, la réponse, et tes verdicts.

---

### Q4 — Standard-before-exception (étudiant) — *"Est-ce qu'un contrat de travail doit forcément être écrit ?"*

**Routage : Gemini Flash 2.5** (59 chars, pas adversarial)

**Ce que tu avais validé sur Sonnet round-3 :** ✓ OK — Laya partait par la règle générale (écrit obligatoire pour la majorité des contrats) puis l'exception (CDI verbal possible).

**Nouvelle réponse (Gemini, post-routeur) :**

> Salut, je suis Laya.
>
> Sur la forme du contrat de travail en Côte d'Ivoire, il y a des subtilités.
>
> Le principe général, posé par le Code du travail ivoirien, est que le contrat de travail est passé librement et les parties peuvent choisir la forme qui leur convient [Art. 14.2, Loi n° 2015-532]. Cela signifie qu'un Contrat à Durée Indéterminée (CDI) peut, en théorie, être verbal.
>
> Cependant, il existe des exceptions importantes pour lesquelles un écrit est obligatoire :
>
> *   **Le Contrat à Durée Déterminée (CDD)** : Il doit obligatoirement être passé par écrit ou constaté par une lettre d'embauche [Art. 15.2, Loi n° 2015-532].
> *   **Le contrat de travail temporaire** (intérim) : Il doit également être formulé par écrit [Art. 14, Loi n° 2015-532].
> *   **La période d'essai** : Si une période d'essai est prévue, elle doit être stipulée par écrit pour être valable [Art. 14.5, Loi n° 2015-532].
>
> Franchement, même pour un CDI, il est **fortement recommandé** d'avoir un écrit (contrat ou lettre d'embauche) pour des raisons de preuve. Cela permet de clarifier les conditions de travail, le salaire, le poste et d'éviter d'éventuels litiges.
>
> Avez-vous une situation particulière en tête, comme un CDD ou un CDI ?

**⚠️ Régression connue :** Gemini ouvre par l'exception ("le principe général... CDI verbal") alors que la règle prompt dit de poser la règle (écrit obligatoire majoritaire) d'abord. Toutes les citations sont valides (Art. 14.2, 15.2, 14, 14.5 sont dans Loi 2015-532). Pas de fabrication.

**Question :** est-ce que cette structure inversée est bloquante pour la béta fermée, ou acceptable étant donné que le contenu reste juste ?

**Verdict Hadi : ___**

---

### Q9 — Citation factuelle simple — *"Combien d'heures max un employé peut travailler par jour normalement ?"*

**Routage : Gemini Flash 2.5** (70 chars)

**Ce que tu avais validé round-3 :** ✓ OK sur Sonnet — clic sur les badges `[Art. 21.2]`, `[Art. 6]`, `[Art. 11]` ouvrait les bons articles dans le side-panel.

**Nouvelle réponse (Gemini) :**

> La règle générale est la suivante : la durée journalière du travail ne peut pas excéder **huit (8) heures** [Art. 6 et Art. 11 du Décret n° 2024-898]. Cette durée de 8 heures inclut même la période de pause d'une demi-heure au moins, si elle est prise en une ou plusieurs fois.
>
> Il y a plusieurs modes de répartition de la durée hebdomadaire de 40 heures, mais ils sont tous basés sur une limite journalière de 8 heures :
> *   8 heures par jour pendant 5 jours ouvrables de la semaine.
> *   Ou 6 heures 40 minutes par jour ouvrable de la semaine.
> *   Ou une répartition inégale des 40 heures hebdomadaires, avec un **maximum de 8 heures par jour** [Art. 6 du Décret n° 2024-898].
>
> Il existe des exceptions pour certains types de personnel (comme le personnel de surveillance ou d'incendie) ou en cas de surcroît extraordinaire de travail [Art. 16 et Art. 25 du Décret n° 2024-898], mais même dans ces cas, les heures au-delà de la durée normale sont généralement considérées comme des heures supplémentaires et doivent être rémunérées comme telles, avec des majorations [Art. 25 du Décret n° 2024-898]. La prolongation ne peut d'ailleurs pas dépasser deux (2) heures au-delà de la durée normale pour certains personnels [Art. 17 du Décret n° 2024-898].
>
> Donc, en principe, un employé ne devrait pas travailler plus de 8 heures par jour, sauf cas particuliers prévus par la loi et donnant lieu à des compensations.
>
> Est-ce que cela répond à votre question ? Avez-vous une situation particulière en tête qui vous pousse à demander cela ?

**Verdict Hadi : ___**

---

### Q17 — Piège droit français vs ivoirien — *"Un CDD peut être renouvelé plusieurs fois ou il y a une limite ?"*

**Routage : Gemini Flash 2.5** (64 chars)

**Ce que tu avais validé round-3 :** ✓ OK sur Sonnet — règle ivoirienne correctement énoncée (renouvelable sans limitation du nombre, plafond cumulatif 24 mois). La règle française "une seule fois" est un piège que Gemini reproduisait avant.

**Nouvelle réponse (Gemini, après ajout de la règle anti-piège français dans le prompt) :**

> Pour un contrat à terme précis (donc un CDD dont la date de fin est connue) :
>
> *   Il ne peut pas être conclu pour une durée initiale supérieure à **deux (2) ans** [Art. 15.4].
> *   Ces contrats peuvent être **renouvelés sans limitation** du nombre de fois [Art. 15.4].
> *   Cependant, l'ensemble des renouvellements ne peut pas avoir pour effet de dépasser la durée maximale cumulative de **deux (2) ans** [Art. 15.4].
>
> En clair, vous pouvez renouveler un CDD plusieurs fois, mais la durée totale du contrat, incluant le contrat initial et tous ses renouvellements, ne doit pas excéder deux ans.
>
> Une fois que la durée cumulée de deux ans est atteinte, le CDD ne peut plus être renouvelé en tant que tel. Si les relations de travail se poursuivent au-delà de cette durée, le contrat se trouve requalifié en Contrat à Durée Indéterminée (CDI) [Art. 15.10 de la Loi n° 2015-532].
>
> C'est une distinction importante à faire, car elle diffère de ce que l'on peut trouver dans d'autres législations.

**Note technique :** `[Art. 15.10 de la Loi n° 2015-532]` a été strippé par le validateur (Art. 15.10 n'avait pas été retourné par l'outil sur ce tour spécifiquement — la requête ciblait Art. 15.4). Le texte "Art. 15.10 de la Loi n° 2015-532" reste lisible mais n'est plus un badge cliquable.

**Verdict Hadi : ___**

---

### Q19 — Discipline de portée — *"Si mon contrat CDD se termine mais que je continue à travailler après, il devient automatiquement un CDI ?"*

**Routage : Gemini Flash 2.5** (110 chars, sous le seuil)

**Ce que tu avais validé round-3 :** ✓ OK sur Sonnet — Laya répondait sur la requalification automatique [Art. 15.10], et **n'évoquait pas** la prime de précarité (3 %) du CDD qui ne s'applique plus quand le contrat continue.

**Nouvelle réponse (Gemini) :**

Gemini a fait 3 recherches successives sans trouver Art. 15.10 dans les chunks retournés. Elle a basculé honnêtement en lane `[INFO]` :

> Si vous continuez à travailler après l'expiration de votre Contrat à Durée Déterminée (CDD) et sans qu'un nouveau contrat écrit n'ait été signé, votre relation de travail est effectivement considérée comme transformée en Contrat à Durée Indéterminée (CDI). Ce passage en CDI est automatique.
>
> Cela a des implications importantes :
>
> *   Le contrat n'est plus soumis aux règles du CDD (par exemple, il n'y a plus de prime de précarité de 3% à la fin, car il n'y a pas de "fin" prévue pour un CDI).
> *   Votre ancienneté est reconnue à partir de la date de début de votre CDD initial.
> *   Si l'employeur souhaite rompre ce nouveau CDI, il devra suivre la procédure de licenciement prévue pour les CDI, c'est-à-dire justifier d'un motif légitime (économique ou personnel) et respecter un préavis.
>
> Malgré mes tentatives, l'outil n'a pas remonté l'article exact du Code du Travail (Loi n° 2015-532) qui stipule cette requalification automatique dans ce tour de conversation. Pour cette raison, je ne peux pas vous fournir une citation spécifique entre crochets pour l'instant.

**⚠️ Bug retrieval connu :** Art. 15.10 EST dans le corpus mais n'est pas retourné de manière fiable pour cette question. C'est un problème de chunking / requête, séparé de l'architecture du routeur. À investiguer.

**⚠️ Mineure scope violation :** mention de "il n'y a plus de prime de précarité" — c'est une *négation* mais ça reste une mention. Tu avais flagué exactement ce pattern en round-3. À surveiller.

**Verdict Hadi : ___**

---

### Q21 — Clarification (salarié) — conversation 3 messages

**Routage observé :**
- M1 (72 chars) → Gemini
- M2 (62 chars) → Gemini
- **M3 (184 chars) → Sonnet** (au-dessus du seuil de 150 chars)

C'est exactement le pattern que le routeur cible : les 2 premiers tours courts et factuels restent sur Gemini, le tour 3 long et détaillé (situation concrète avec imprimerie + 7h–14h) bascule sur Sonnet pour le traitement multi-axes.

**Message 1 (utilisateur) :** "combien d'heure de pause l'employeur doit donné pour 7 heures de travail"

**Réponse Laya (Gemini, M1) :**

> Le Code du travail ivoirien, notamment le Décret n° 2024-898, précise que pour les entreprises qui fonctionnent sans interruption (jour et nuit, dimanches et jours fériés inclus) et où le travail est organisé en continu par équipes, la durée journalière de travail ne peut excéder huit (8) heures. Cette durée inclut une période de pause d'au moins une demi-heure, qui peut être prise en une ou plusieurs fois [Art. 11, Décret n° 2024-898].
>
> Donc, dans ce type de configuration, une pause d'au moins 30 minutes doit être accordée pour une journée de travail pouvant aller jusqu'à 8 heures.
>
> Si votre situation n'est pas un service de quart par roulement, n'hésitez pas à me le préciser.

**Message 2 (utilisateur) :** "combien d'heure minimum de travail pour avoir 30 mins de pause?"

**Réponse Laya (Gemini, M2) :**

> Le Code du travail ivoirien, notamment le Décret n° 2024-898, mentionne qu'une période de pause d'au moins une demi-heure est incluse dans une durée journalière de travail ne pouvant excéder huit (8) heures, spécifiquement pour les entreprises fonctionnant en continu par équipes [Art. 11, Décret n° 2024-898].
>
> Cependant, le texte ne précise pas de durée minimale de travail en dessous de laquelle cette pause de 30 minutes ne serait pas due. Il indique plutôt que pour les services de quart, la journée de travail (jusqu'à 8 heures) inclut cette pause.
>
> Pour le travail de nuit, la durée ne peut excéder huit heures consécutives et est entrecoupée d'une ou deux pauses de quinze minutes [Art. 5, Loi n° 2015-532].
>
> En résumé, pour les cas spécifiques de travail en continu par équipes, la pause de 30 minutes est prévue pour une journée de travail allant jusqu'à 8 heures.

**Message 3 (utilisateur) :** "Je travail dans une imprimerie, les ou on doit faire demi journée, au lieu de faire 4h de travail (8-12h) comme toutes les autres société il nous fait venir de 7-14h, et sans pause"

**Réponse Laya (Sonnet, M3) :**

> Voilà, voici ce que ça donne concrètement pour votre situation.
>
> **Sur les heures de travail**
>
> La durée légale hebdomadaire est fixée à 40 heures pour les entreprises non agricoles [Art. 21.2 — Loi n° 2015-532]. Une imprimerie entre dans cette catégorie. Donc une "demi-journée" ne signifie pas que l'employeur peut vous faire travailler autant qu'il veut — les heures s'additionnent dans la semaine et ne doivent pas dépasser ce plafond sans être payées en heures supplémentaires.
>
> **Sur la pause**
>
> Le Code du travail ne fixe pas une obligation générale de pause après X heures travaillées pour toutes les situations. La règle des 30 minutes minimum concerne spécifiquement les services en continu par équipes (service de quart) [Art. 11 — Décret n° 2024-898].
>
> Cela dit, **7 heures sans aucune pause** (7h-14h), c'est une pratique qui peut relever de votre convention collective sectorielle (imprimerie/BTP/industrie) ou du règlement intérieur de l'entreprise.
>
> **Ce que je vous suggère concrètement :**
>
> Vérifiez deux choses :
> 1. **Votre règlement intérieur** — l'employeur est obligé d'y afficher les horaires et les pauses [Art. 7 — Décret n° 2024-898]. S'il prévoit une pause et qu'elle n'est pas accordée, c'est une violation directe.
> 2. **Votre bulletin de salaire** — les heures de 7h à 14h font 7 heures. Si cela porte votre semaine au-delà de 40h, les heures excédentaires doivent être payées comme heures supplémentaires.
>
> Vous avez accès au règlement intérieur de votre entreprise ?

**Note importante :** sur le M3, Sonnet a **fait le calcul des heures supplémentaires** (40h/semaine, additionnement) et **maintenu la discipline de portée sur la pause** (n'a pas affirmé une violation universelle). C'est exactement le pattern que tu avais validé en round-3 sur Q21.

**Verdict Hadi : ___**

---

### Q23 — Hypothèse à nommer (salarié) — *"mon patron nous donne pas de l'eau potable, il nous fais remplir de l'eau du robinet"*

**Routage : Gemini Flash 2.5** (~85 chars)

**Ce que tu avais validé round-3 :** ✓ OK sur Sonnet — demandait la source de l'eau (SODECI vs puits/citerne) avant tout verdict.

**Nouvelle réponse (Gemini) :**

> Votre employeur a l'obligation de s'assurer que les travailleurs disposent d'**eau potable pour la boisson** [Art. 7, Art. 41.6]. La loi prévoit un minimum de **six litres par travailleur et par jour** [Art. 7].
>
> Un point important : si l'eau ne provient pas d'une distribution publique qui garantit sa potabilité (comme l'eau de la SODECI par exemple), le médecin-inspecteur du Travail ou l'inspecteur du Travail et des Lois sociales peut exiger que l'employeur fasse **analyser cette eau à ses frais** [Art. 7]. L'eau doit faire l'objet de contrôles périodiques par les services habilités de l'État [Art. 41.6].
>
> Donc, si l'eau du robinet fournie par votre patron ne provient pas d'un réseau public (genre SODECI) ou si sa potabilité n'est pas garantie et contrôlée, il y a un problème. Le simple fait de "faire remplir de l'eau du robinet" sans cette garantie ou ces contrôles pourrait être une non-conformité.
>
> [INFO] En tant qu'employeur, il a une obligation générale de prendre toutes les mesures utiles pour protéger la vie et la santé de ses salariés [Art. 41.2]. S'il s'abstient intentionnellement d'appliquer ces mesures de protection et de salubrité, il peut être passible d'une amende [Art. 102.4].
>
> Pour clarifier la situation, est-ce que l'eau du robinet provient du réseau public (par exemple, la SODECI) ou d'une autre source (un puits, par exemple) ?

**Verdict Hadi : ___**

---

### Q40 — Honnêteté capacité — *"Les primes de transport sont obligatoires dans le secteur privé ivoirien ?"*

**Routage : Gemini Flash 2.5** (75 chars)

**Ce que tu avais validé round-3 :** ✓ OK sur Sonnet — disait explicitement qu'elle n'a pas les conventions collectives sectorielles dans son corpus, redirigeait vers RH / délégué / DGT.

**Nouvelle réponse (Gemini) :**

> Je vois que la recherche a remonté plusieurs articles concernant le transport des travailleurs, notamment en cas de voyage pour le travail [Art. 26.4], ou les frais de transport liés aux accidents du travail [Art. 81] et aux apprentis [Art. 16]. Elle mentionne également des pourcentages pour "Transport de fonds et valeurs", "Auxiliaires du transport", "Transport aérien" [Art. 1] mais cela semble faire référence à des secteurs d'activité ou des barèmes de révision salariale, et non à une prime de transport généralisée et obligatoire.
>
> Cependant, je ne trouve pas d'article qui stipule une obligation générale pour les employeurs du secteur privé de verser une "prime de transport" en tant que tel pour les trajets quotidiens domicile-travail.
>
> [INFO] En Côte d'Ivoire, l'obligation d'une prime de transport pour les trajets quotidiens n'est généralement pas prévue directement par le Code du travail pour tous les secteurs d'activité du privé. Elle peut en revanche être établie par :
>
> *   **Une convention collective sectorielle** : C'est souvent à ce niveau que des dispositions spécifiques sur les primes de transport ou d'autres avantages liés aux déplacements peuvent être négociées et rendues obligatoires pour les entreprises du secteur concerné.
> *   **Un accord d'entreprise** : L'employeur et les représentants du personnel peuvent avoir négocié et signé un accord qui prévoit une telle prime.
> *   **Le contrat de travail** : Si votre contrat de travail mentionne une prime de transport, elle devient une obligation contractuelle pour votre employeur.
> *   **Un usage constant dans l'entreprise** : Si l'employeur a l'habitude de verser une prime de transport de manière régulière, générale et fixe, cela peut devenir un avantage acquis.
>
> Pour avoir une réponse définitive sur votre situation, je vous recommande de consulter :
>
> *   Votre **contrat de travail**.
> *   La **convention collective** applicable à votre secteur d'activité (vous pouvez demander à votre employeur ou aux représentants du personnel quelle est la convention collective de votre entreprise).
> *   Votre **délégué du personnel** ou les **représentants syndicaux** au sein de votre entreprise, s'il y en a.

**Verdict Hadi : ___**

---

## Limites connues à signaler

1. **Q4 — structure inversée sur Gemini.** Le modèle ouvre par l'exception (CDI verbal) au lieu de la règle (écrit obligatoire majoritaire). Sonnet le faisait correctement en round-3. C'est une limite architecturale des modèles économiques — observée à l'identique sur Haiku, Mistral, Gemini, Grok. Le contenu reste juste, les citations sont valides, pas de fabrication. **Question pour toi : bloquant ou acceptable pour la béta fermée ?**

2. **Q19 — retrieval incomplet sur Gemini.** L'outil n'a pas retourné Art. 15.10 de manière fiable. Laya est tombée en lane `[INFO]` honnêtement, mais le contenu manque la citation principale. C'est un bug de retrieval / chunking, à corriger séparément de l'architecture de routage.

3. **Stripper de citations.** Si tu cliques sur un badge `[Art. X]` et qu'il n'ouvre rien — c'est que le validateur a strippé une citation que le modèle a fabriquée ou évoquée depuis sa mémoire (Art. 15.10 sur Q17 par exemple). Le texte reste lisible mais le badge n'est plus interactif. Comportement intentionnel : on préfère un texte muet à un badge mensonger.

---

Mets tes verdicts directement dans ce fichier (sous chaque "Verdict Hadi :") ou par WhatsApp.

Merci !
