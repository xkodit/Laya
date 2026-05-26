# Round 3 — V&V de l'itération du prompt (post Hadi-50)

Salut Hadi !

Après tes 50 questions, j'ai fait une grosse itération du system prompt pour répondre aux 8 MAUVAIS que tu avais flagués + le bug d'affichage des citations.

J'ai déjà retesté chaque question — voici les transcripts. Ton verdict V&V est ce qui compte : marque **OK / MAUVAIS / OK-avec-critique** par question, et commente quand tu vois un problème.

**Commits concernés**

- `a6b25c1` — fix bug d'affichage des citations (déjà déployé)
- `31ffbb1` — 6 nouvelles règles ajoutées au prompt
- `1fd082e` — renforcement Q4 (structure règle-puis-exception promue en section dédiée)
- `2d93c57` — renforcement Q19 (la règle disait juste "ne pas mentionner hors-sujet" → précisée à "même pour expliquer que ça ne s'applique pas")

---

## Les 6 règles ajoutées au prompt

1. **Inférer les signaux** — si la question fixe déjà une variable (ex : "fin de contrat" → CDD), ne pas redemander.
2. **Nommer l'hypothèse** — quand une variable est inférée, le dire explicitement ("je pars du principe que c'est un CDD").
3. **Aucun verdict sur un fait non vérifié** — confirmer le fait OU expliciter l'hypothèse (Q21/Q23).
4. **Discipline de portée** — ne mentionner un article que s'il s'applique, même pas pour préciser qu'il ne s'applique pas (Q19).
5. **Capability honesty** — Laya n'a pas les conventions collectives sectorielles ni la jurisprudence, ne le promet jamais (Q40).
6. **Structure règle-puis-exception** — règle générale d'abord, exception ensuite (Q4).
7. **Reframe d'intention problématique** — sur les questions à intention discriminatoire, nommer le problème + offrir un terrain légal alternatif (Q51 round-2).

---

## Tests prêts pour ton V&V

### Q4 — factuel_simple (étudiant) — "Est-ce qu'un contrat de travail doit forcément être écrit ?"

**Ce que tu avais flagué :** Laya partait par l'exception (CDI verbal) au lieu de la règle (écrit obligatoire). Logique inversée.

**Règle ajoutée :** Structure règle-puis-exception (avec ton exemple du contrat écrit comme cas type dans le prompt).

**Réponse Laya v3 :**

> Bonne question — et la réponse est "ça dépend du type de contrat". Laisse-moi chercher les textes précis. Voilà les textes qu'il faut. La réponse courte : **dans la grande majorité des cas, oui, l'écrit est obligatoire** — sauf pour le CDI classique, où la loi laisse une liberté de forme. Voici le détail :
>
> ---
>
> **La règle générale : l'écrit est requis**
>
> Pour les contrats les plus courants dans une entreprise, l'écrit n'est pas optionnel :
>
> - **CDD** : doit obligatoirement être passé par écrit ou constaté par une lettre d'embauche [Art. 15.2]. Et attention — un CDD qui ne respecte pas cette exigence (et les autres conditions de forme) est automatiquement **requalifié en CDI** [Art. 15.10].
> - **Contrat de travail temporaire (intérim)** : l'écrit est aussi obligatoire, avec des mentions spécifiques à inclure [Art. 14].
> - **Période d'essai** (CDI ou CDD) : si les parties décident d'inclure une période d'essai, le contrat doit être écrit ou constaté par une lettre d'embauche mentionnant sa durée [Art. 14.5].
>
> ---
>
> **L'exception : le CDI sans période d'essai**
>
> Pour un CDI conclu directement, la loi pose un principe de liberté de forme : "le contrat de travail est passé librement… constaté dans les formes qu'il convient aux parties d'adopter" [Art. 14.2]. Techniquement, un CDI verbal est donc possible.
>
> Mais franchement, dans la pratique — et encore plus à votre niveau en tant que cadre — c'est une option à éviter. Sans écrit, impossible de prouver les termes convenus (salaire, poste, avantages, clauses particulières). Le décret d'application confirme d'ailleurs que le contrat écrit doit comporter une liste précise de mentions [Art. 14.2].
>
> ---
>
> En résumé : si c'est un CDD, un intérim, ou qu'il y a une période d'essai → **l'écrit est une obligation légale**, pas un choix. Si c'est un CDI sans période d'essai → c'est techniquement libre, mais l'écrit reste fortement recommandé.
>
> Vous avez une situation particulière en tête — côté employeur ou salarié ?

**Verdict Hadi :**

---

### Q9 / Q10 / Q17 — bug d'affichage des citations

**Ce que tu avais flagué :**

- Q9 : cliquer sur un `[Art. X]` ouvrait l'article d'une question précédente du même chat (Q7 → Q9 cross-resolution).
- Q10 + Q17 : dans une seule réponse, cliquer sur trois `[Art. 15.X]` différents ouvrait tous le même Art. 15.4.

**Fix code :** scoping par message + résolution stricte article par article avec hiérarchie prefix-only.

**Vérification badges cliqués (Hussein, dans l'UI déployée) :**

Q9 — "Combien d'heures max un employé peut travailler par jour normalement ?"
- `[Art. 21.2, Loi n° 2015-532]` → ouvre sur 40h/semaine non-agricole ✓
- `[Art. 6, Décret n° 2024-898]` (×2) → ouvre sur les 3 modes de répartition 8h/jour ✓
- `[Art. 11, Décret n° 2024-898]` → ouvre sur le service de quart par roulement ✓

Q17 — "Un CDD peut être renouvelé plusieurs fois ou il y a une limite ?"
- `[Art. 15.4]` → ouvre sur le plafond de 2 ans + renouvellements illimités ✓
- `[Art. 15.1]` → ouvre sur la définition CDD + règle du 1/3 effectif ✓
- `[Art. 15.5]` → ouvre sur le licenciement économique + 3 mois max ✓

(Q10 est la même question que Q9 — re-test couvert par Q9.)

**Verdict Hadi (re-clique en UI si tu veux confirmer) :**

---

### Q21 — clarification (salarié) — conversation 3 messages

**Ce que tu avais flagué :** Verdict "doublement illégal" basé sur l'hypothèse non vérifiée que demi-journée = 4h (pratique traditionnelle, pas la loi).

**Règle ajoutée :** Aucun verdict sur un fait non vérifié — confirmer OU expliciter l'hypothèse.

**Message 1 (utilisateur) :** "combien d'heure de pause l'employeur doit donné pour 7 heures de travail"

**Réponse Laya :**

> Salut, je suis Laya. Bonne question, voici ce que dit le texte.
>
> La loi ivoirienne ne fixe pas une durée de pause en fonction d'un nombre précis d'heures travaillées comme un ratio automatique. Ce qu'elle prévoit, c'est une **pause minimale d'une demi-heure (30 minutes)** pour une journée de travail en continu pouvant aller jusqu'à 8 heures [Art. 10, Loi n° 2015-532] [Art. 11, Décret n° 2024-898]. Cette pause peut être prise en une seule fois ou fractionnée en plusieurs fois.
>
> Donc pour 7 heures de travail : le minimum légal est **30 minutes de pause**, que l'employeur peut fixer librement ou définir d'accord avec les salariés.
>
> Deux précisions importantes :
> - Ce minimum de 30 minutes s'applique dans le cadre du **travail en continu** (service de quart, roulement). Pour les autres régimes, la pause du midi (déjeuner) est souvent ce qui sépare la journée en deux demi-journées — mais là, c'est la pratique courante, pas un plancher légal distinct.
> - L'employeur garde une certaine flexibilité sur l'organisation concrète : il peut accorder plus, ou fractionner la pause, selon les besoins du service.
>
> Vous avez une situation précise en tête chez Nouvelle Mici Embaci — pause non accordée, durée insuffisante, ou autre chose ?

**Message 2 (utilisateur) :** "combien d'heure minimum de travail pour avoir 30 mins de pause?"

**Réponse Laya :**

> Bonne question, laissez-moi vérifier ça précisément dans les textes. Voilà, et je vais être honnête avec vous : **le Code du travail ivoirien ne fixe pas de seuil minimum d'heures travaillées pour déclencher automatiquement une pause.**
>
> Ce que les textes prévoient, c'est ceci :
>
> La pause de **30 minutes minimum** est mentionnée dans le cadre spécifique du **travail en continu** (service de quart, roulement jour/nuit), pour une journée qui peut aller jusqu'à 8 heures [Art. 10, Loi n° 2015-532] [Art. 11, Décret n° 2024-898]. Le texte dit que la journée de travail "ne peut excéder 8 heures, **y compris** la période de pause d'une demi-heure au moins."
>
> Autrement dit : les 30 minutes de pause sont **incluses dans** les 8 heures, pas en plus.
>
> Pour le travail de nuit, c'est différent : la loi prévoit **une ou deux pauses de 15 minutes** sur 8 heures consécutives [Art. 5, Loi n° 2015-532].
>
> [INFO] En dehors du travail en continu et du travail de nuit, la loi ne fixe pas de règle chiffrée type "après X heures, droit à Y minutes de pause". En pratique, la pause déjeuner (souvent 1h) est la norme dans beaucoup d'entreprises, mais c'est une pratique ou une clause contractuelle — pas un plancher légal distinct pour le régime classique de jour.
>
> Vous avez un cas concret en tête ? Un horaire précis ou un type de poste chez Nouvelle Mici Embaci ?

**Message 3 (utilisateur) :** "Je travail dans une imprimerie, les ou on doit faire demi journée, au lieu de faire 4h de travail (8-12h) comme toutes les autres société il nous fait venir de 7-14h, et sans pause"

**Réponse Laya :**

> D'accord, je vois mieux la situation. Laissez-moi chercher ce que les textes disent sur la durée du travail et les pauses. OK, j'ai ce qu'il faut. Voilà ce que ça donne concrètement dans ton cas.
>
> **Le problème des heures : 7h de travail un jour de demi-journée**
>
> La durée légale de travail est de **40 heures par semaine** pour une entreprise non agricole [Art. 21.2, Loi n° 2015-532]. Si ta "demi-journée" est censée être la moitié de ta semaine de travail normale, faire venir les salariés de 7h à 14h (7 heures) là où les autres boites font 4h (8h-12h), c'est clairement du dépassement — les heures au-delà de la durée normale **sont des heures supplémentaires** et doivent être majorées.
>
> Concrètement, les majorations minimales sont :
> - **+15 %** pour les heures de la 41e à la 46e heure de la semaine
> - **+50 %** pour les heures au-delà de la 46e heure [Art. 25, Décret n° 2024-898]
>
> Donc si ces 3 heures en plus (de 12h à 14h) font dépasser le seuil de 40h/semaine, elles doivent être payées en heures sup. Est-ce que c'est le cas ? Tu sais combien tu fais au total sur la semaine ?
>
> **Le problème de la pause : 7h sans rien**
>
> 7 heures de travail sans aucune pause, c'est problématique. Pour le travail en continu (service de quart, production sans interruption), la loi est claire : **la journée ne peut excéder 8h, pause de 30 minutes minimum incluse** [Art. 11, Décret n° 2024-898]. Aucune pause pendant 7h d'affilée, ça ne tient pas.
>
> **Ce que je te conseille concrètement :**
>
> Avant d'aller plus loin, deux questions importantes :
> 1. Ces heures en plus (7h au lieu de 4h) sont-elles **payées** ou pas du tout compensées ?
> 2. Tu es dans quelle situation — seul dans ce cas ou c'est tous les salariés de l'imprimerie ?
>
> Ça va définir la meilleure approche : simple discussion avec les RH, passage par le délégué du personnel, ou autre chose.

**À noter :** plus de "doublement illégal", phrasing conditionnel sur le dépassement, demande explicite des heures totales sur la semaine avant de conclure aux heures sup. Le verdict sur la pause reste (correct selon ton commentaire round-1).

**Verdict Hadi :**

---

### Q23 — clarification (salarié) — "mon patron nous donne pas de l'eau potable, il nous fais remplir de l'eau du robinet"

**Ce que tu avais flagué :** Laya recommandait l'Inspection du Travail sans demander la source de l'eau (SODECI = potable, pas de violation).

**Règle ajoutée :** Aucun verdict sur un fait non vérifié.

**Réponse Laya v3 :**

> C'est une vraie question d'hygiène et de sécurité au travail — laissez-moi chercher ce que la loi prévoit. La réponse est claire — et en fait, **tout dépend de la source de l'eau du robinet**.
>
> Voici ce que dit la loi : l'employeur est obligé de fournir de l'eau potable aux salariés, à raison d'**au moins 6 litres par personne par jour** [Art. 7, Loi n° 2015-532]. Et plus précisément : **c'est l'employeur qui assure l'approvisionnement en eau potable**, avec des contrôles périodiques obligatoires [Art. 41.6, Loi n° 2015-532].
>
> **La question clé : d'où vient ce robinet ?**
>
> - Si c'est de l'**eau SODECI** (réseau public ivoirien) — cette eau est garantie potable par la distribution publique. Dans ce cas, remplir une carafe au robinet SODECI **respecte la loi**. L'obligation est remplie.
> - Si c'est une **citerne, un puits, ou un forage privé** — là c'est différent. L'employeur doit faire analyser cette eau à ses frais par un médecin-inspecteur ou un inspecteur du Travail pour prouver qu'elle est potable [Art. 7, Loi n° 2015-532]. Sans cette analyse, il est en infraction.
>
> Donc avant de conclure à une violation, la vraie question c'est : **votre bureau est raccordé à quoi ?** Si c'est la SODECI, votre patron est techniquement dans les clous. Si c'est une source privée non contrôlée, il y a un vrai problème.
>
> Vous savez d'où vient l'eau chez Nouvelle Mici Embaci ?

**Verdict Hadi :**

---

### Q40 — hors_corpus — "Les primes de transport sont obligatoires dans le secteur privé ivoirien ?"

**Ce que tu avais flagué :** Laya proposait d'aller chercher ce que prévoyait la convention collective sectorielle — qu'elle n'a pas dans son corpus.

**Règle ajoutée :** Capability honesty — Laya n'a pas les conventions sectorielles, le dit explicitement, redirige vers RH / délégué / DGT.

**Réponse Laya v3 :**

> Bonne question — laissez-moi chercher ça précisément. Honnêteté d'abord : **la loi ivoirienne ne crée pas d'obligation générale de prime de transport pour tous les salariés du secteur privé.**
>
> Ce que le Code du travail prévoit, c'est plus ciblé :
>
> - **Travail de nuit** : si l'employeur n'assure pas le transport lui-même, il est obligé de verser une **indemnité spéciale de transport** aux salariés de nuit. Le montant est fixé par accord entre organisations d'employeurs et de travailleurs [Art. 10, Loi n° 2015-532].
> - **Déplacements professionnels / mutation** : les frais de voyage (domicile → lieu d'emploi, retours en congé, fin de contrat) sont à la charge de l'employeur dans des cas précis [Art. 26.1, Loi n° 2015-532]. Mais c'est pour les déplacements liés au contrat, pas le trajet quotidien domicile-bureau.
>
> Pour le **trajet quotidien domicile-travail classique**, la loi ne fixe pas d'obligation universelle. La prime de transport, quand elle existe, vient généralement :
> - de la **convention collective sectorielle** de votre secteur,
> - du **règlement intérieur** de l'entreprise,
> - ou d'un **usage d'entreprise** établi.
>
> [INFO] En pratique, beaucoup d'entreprises ivoiriennes versent une prime de transport — mais c'est une pratique d'entreprise ou conventionnelle, pas une obligation légale générale.
>
> **Pour savoir si vous y avez droit chez Nouvelle Mici Embaci**, le bon réflexe c'est de vérifier votre convention collective sectorielle et votre règlement intérieur. **Je n'ai pas les conventions collectives sectorielles dans mon corpus** — pour ça, votre délégué du personnel ou la DGT peuvent vous renseigner précisément.
>
> Vous cherchez à savoir si vous y avez droit personnellement, ou c'est pour gérer une équipe ?

**Verdict Hadi :**

---

## Pas encore prêt pour V&V

### Q19 — multi_articles (salarié) — "Si mon contrat CDD se termine mais que je continue à travailler après, il devient automatiquement un CDI ?"

**Ce que tu avais flagué :** Laya mentionnait l'indemnité de fin de CDD (3 %) alors que le scénario l'écarte déjà — tokens gaspillés.

**État :** retesté une fois mais Laya mentionnait toujours le 3 % "pour préciser qu'il ne s'applique plus puisque le contrat continue en CDI" — pas assez strict. **Règle renforcée dans `2d93c57`** (ajout explicite "même pour expliquer qu'elle ne s'applique pas"). Re-test à faire une fois le déploiement Vercel actif.

---

Mets tes verdicts directement dans ce fichier (sous chaque "Verdict Hadi :") ou réponds-moi sur WhatsApp avec OK/MAUVAIS + commentaire.

Merci !
