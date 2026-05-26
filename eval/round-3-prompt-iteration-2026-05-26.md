# Round 3 — V&V de l'itération du prompt (post Hadi-50)

**Dernière mise à jour : 2026-05-26 (en soirée).** Refresh avec les derniers transcripts après deux itérations supplémentaires (durcissement Q4 + revert d'un test Haiku) et après l'expansion du corpus (CCI 1977 + 3 autres docs).

Salut Hadi !

Après tes 50 questions, j'ai fait une grosse itération du system prompt pour répondre aux 8 MAUVAIS que tu avais flagués + le bug d'affichage des citations.

J'ai déjà retesté chaque question — voici les transcripts. Ton verdict V&V est ce qui compte : marque **OK / MAUVAIS / OK-avec-critique** par question, et commente quand tu vois un problème.

**Commits concernés**

- `a6b25c1` — fix bug d'affichage des citations (déjà déployé)
- `31ffbb1` — 6 nouvelles règles ajoutées au prompt
- `1fd082e` — renforcement Q4 (structure règle-puis-exception promue en section dédiée)
- `2d93c57` — renforcement Q19 (la règle disait juste "ne pas mentionner hors-sujet" → précisée à "même pour expliquer que ça ne s'applique pas")
- `d95fbd9` — durcissement Q4 supplémentaire (anti-example "MAUVAISE ouverture" + auto-vérification) — initialement nécessaire pour Haiku (voir ci-dessous), conservé sur Sonnet car strict-additif

**Note importante — état du corpus :** depuis l'envoi initial de ce paquet, 4 nouveaux docs ont été ingérés (Convention Interprofessionnelle 1977, Décret 2024-902 obligations employeurs, Code de Prévoyance Sociale CIV-57048, Décret n° 96-197 règlement intérieur). Laya peut maintenant citer depuis ces nouvelles sources — certaines réponses ci-dessous l'utilisent. Si tu vois une citation depuis un de ces nouveaux docs, c'est normal.

**Détour Haiku (info, pas pour V&V) :** on a testé Haiku 4.5 pour réduire le coût par message. Q4 a regressé puis re-passé après le `d95fbd9` ; mais Q21 a halluciné un seuil légal de 6h pour la pause (fabrication sous citation `[Art. 11]` qui ne dit pas ça). Revert à Sonnet — Haiku n'est pas viable pour Laya. Les transcripts ci-dessous sont tous sur **Sonnet 4.6**.

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

**Réponse Laya v3 (refresh post-`d95fbd9`) :**

> Bonne question — et la réponse est plus nuancée qu'un simple oui ou non.
>
> **La règle générale : l'écrit s'impose dans la majorité des cas concrets.**
>
> Pour un CDD, c'est sans ambiguïté : le contrat doit obligatoirement être écrit ou constaté par une lettre d'embauche [Art. 15.2]. Même chose pour le travail temporaire/intérim, qui exige un contrat écrit avec des mentions précises [Art. 14]. Et si les parties décident d'inclure une période d'essai, l'écrit devient également obligatoire — le contrat ou la lettre d'embauche doit mentionner expressément la durée de cet essai [Art. 14.5].
>
> **L'exception : le CDI peut techniquement être verbal.**
>
> Pour un CDI sans période d'essai, la loi pose un principe de liberté de forme : le contrat est "constaté dans les formes qu'il convient aux parties d'adopter" [Art. 14.2]. Un accord verbal est donc juridiquement possible.
>
> Mais franchement, en pratique, c'est très peu recommandable — ni pour l'employeur ni pour le salarié. Sans écrit, prouver les termes convenus (salaire, poste, classification) devient compliqué dès le premier litige.
>
> **En résumé :** si vous êtes en train de recruter ou de formaliser une situation, l'écrit est la bonne option dans tous les cas — et l'obligation dans la plupart. Vous avez une situation particulière en tête ?

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

**Réponse Laya (refresh post-corpus expansion) :**

> Bonne question, et la réponse dépend un peu du contexte — voici ce que dit la loi.
>
> **La règle posée par les textes** concerne spécifiquement le travail en continu (service de quart, sans interruption) : pour une journée de travail allant jusqu'à 8 heures, une pause d'au moins **une demi-heure** doit être accordée, prise en une ou plusieurs fois [Art. 10 - Loi n° 2015-532] [Art. 11 - Décret n° 2024-898].
>
> Pour un régime de **7 heures de travail en continu**, cette règle de la demi-heure minimum s'applique donc.
>
> **Ce que la loi ne fixe pas en dehors du travail en continu**, c'est un seuil universel de pause pour tout type d'horaire. Dans ce cas, c'est le règlement intérieur de l'entreprise qui s'applique [Art. 7 - Décret n° 2024-898] — il doit mentionner l'horaire journalier et les modalités.
>
> En pratique, voici ce que ça signifie pour vous :
> - Si le travail est organisé en continu (sans coupure pour repas par exemple), la loi impose **minimum 30 minutes** de pause sur les 7h.
> - Si le travail est organisé avec une coupure classique (ex. 8h-12h / 14h-17h), la coupure du midi compte comme temps de repos — dans ce cas, la pause est déjà intégrée dans la structure de la journée.
>
> Vous avez une situation particulière en tête — des salariés qui travaillent 7h sans pause du tout ?

**Message 2 (utilisateur) :** "combien d'heure minimum de travail pour avoir 30 mins de pause?"

**Réponse Laya (refresh — utilise CCI 1977 maintenant en corpus) :**

> Bonne question, laissez-moi chercher ça précisément. Voilà ce que les textes disent précisément.
>
> **La règle générale (travail en continu / service de quart)** : la pause de 30 minutes minimum est intégrée dans une journée de **8 heures maximum** [Art. 10 - Loi n° 2015-532] [Art. 11 - Décret n° 2024-898]. La loi ne fixe pas un seuil d'heures à partir duquel la pause se déclenche — elle dit simplement que la journée de 8h inclut au moins 30 min de pause.
>
> **Ce qui est plus précis, c'est une convention collective** qui donne le seuil que vous cherchez : dès que le travail ininterrompu dépasse **6 heures**, une demi-heure de pause payée doit être accordée. Et si ce travail tombe un dimanche ou un jour férié, c'est **1 heure** de pause payée [Art. 52 - Convention AICI/UGTCI du 19 juillet 1977].
>
> En résumé pratique :
> - **Moins de 6h de travail continu** → pas de seuil légal universel fixant une pause obligatoire.
> - **Plus de 6h de travail continu** → 30 minutes de pause, payées comme du temps de travail (selon la convention collective).
> - **Plus de 6h un dimanche ou jour férié** → 1 heure de pause payée.
>
> Un point important : cette convention collective (AICI/UGTCI) couvre un secteur spécifique. Si votre entreprise n'en relève pas, c'est le règlement intérieur et les usages de l'entreprise qui s'appliquent pour fixer ce seuil. Vous avez un cas concret à l'esprit pour Nouvelle Mici Embaci ?

**Message 3 (utilisateur) :** "Je travail dans une imprimerie, les ou on doit faire demi journée, au lieu de faire 4h de travail (8-12h) comme toutes les autres société il nous fait venir de 7-14h, et sans pause"

**Réponse Laya (refresh — utilise CCI 1977 + math corrigé) :**

> Ça c'est une situation concrète qui mérite qu'on regarde ça sérieusement. Laissez-moi chercher ce que la loi dit sur les horaires et les pauses. Voilà, j'ai ce qu'il faut. Votre situation soulève deux problèmes distincts.
>
> **1. Les heures en trop — c'est du temps supplémentaire qui doit être payé**
>
> Une "demi-journée" de travail, légalement, s'inscrit dans un horaire de 40h/semaine [Art. 21.2 - Loi n° 2015-532]. L'employeur répartit librement ces heures — 8h/jour sur 5 jours, ou 6h40 sur 6 jours, etc. [Art. 6 - Décret n° 2024-898]. Mais toute heure au-delà de ces 40h hebdomadaires devient une **heure supplémentaire majorée**.
>
> Si les autres jours de la semaine vous faites déjà vos heures normales, les heures faites au-delà ce jour-là (de 12h à 14h, soit 2h) doivent être payées avec majoration. Au minimum **+15 % de la 41e à la 46e heure, et +50 % au-delà** [Art. 25 - Décret n° 2024-898].
>
> **Est-ce que ces 2 heures supplémentaires vous sont payées ?**
>
> **2. L'absence de pause — c'est clairement un problème**
>
> 7 heures de travail continu (7h-14h) sans aucune pause, c'est une violation. La loi est claire : au-delà de 6 heures de travail ininterrompu, une **demi-heure de pause payée** doit être accordée [Art. 52 - Convention AICI/UGTCI]. Et pour le travail en continu en général, la journée de 8h doit inclure **au moins 30 minutes de pause** [Art. 11 - Décret n° 2024-898].
>
> En résumé, votre employeur vous fait travailler plus longtemps que les autres **sans pause et potentiellement sans majoration**. Ce sont deux irrégularités cumulées.
>
> Avant d'aller plus loin : est-ce que d'autres collègues sont dans la même situation ? Et avez-vous déjà tenté d'en parler à la direction ou à un délégué du personnel ?

**À noter :** plus de "doublement illégal", phrasing conditionnel sur le dépassement, demande explicite si les 2 heures sont payées avant de conclure. Le verdict sur la pause s'appuie maintenant sur la CCI 1977 Art. 52 (nouvelle source en corpus) pour le seuil de 6h. Math corrigé : 12h-14h = 2h (pas 3h comme dans la version précédente).

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

### Q19 — multi_articles (salarié) — "Si mon contrat CDD se termine mais que je continue à travailler après, il devient automatiquement un CDI ?"

**Ce que tu avais flagué :** Laya mentionnait l'indemnité de fin de CDD (3 %) alors que le scénario l'écarte déjà — tokens gaspillés.

**Règle renforcée dans `2d93c57`** (ajout explicite "même pour expliquer qu'elle ne s'applique pas").

**Réponse Laya v3 :**

> Bonne question — et oui, c'est exactement ce que prévoit la loi. Laissez-moi vérifier l'article précis. Oui, c'est automatique. Voici comment ça fonctionne :
>
> **La règle de base** : tout CDD qui ne respecte pas les conditions légales — ou dont la relation de travail se poursuit après le terme sans nouveau contrat formalisé — est réputé être un CDI [Art. 15.10, Loi n° 2015-532].
>
> Concrètement, dès que vous continuez à travailler après la date de fin de votre CDD sans qu'un nouveau contrat (CDD ou CDI) soit signé, la loi considère que les deux parties ont tacitement accepté de poursuivre la relation de travail à durée indéterminée. Ce n'est pas une décision à prendre, c'est une conversion automatique de plein droit.
>
> **Ce que ça change pour vous immédiatement :**
> - Vous bénéficiez de toute la protection attachée au CDI, notamment les règles de licenciement (préavis, motif valable, procédure).
> - Votre ancienneté court **depuis le début de votre CDD initial**, pas depuis la date de la conversion. Cela compte pour les indemnités et autres droits calculés sur la durée de service.
>
> **Du côté de l'employeur**, il ne peut plus mettre fin à la relation comme à la fin d'un CDD — il doit respecter la procédure de licenciement. S'il essaie de vous "laisser partir" comme si le CDD s'était simplement terminé, c'est un licenciement sans procédure, ce qui l'expose à des sanctions.
>
> Vous avez une situation précise en tête, ou c'est pour anticiper ?

**À noter :** plus aucune mention de l'indemnité de fin de CDD (3 %) — même pas pour préciser qu'elle ne s'applique pas. La règle `2d93c57` a tenu.

**Verdict Hadi :**

---

Mets tes verdicts directement dans ce fichier (sous chaque "Verdict Hadi :") ou réponds-moi sur WhatsApp avec OK/MAUVAIS + commentaire.

Merci !
