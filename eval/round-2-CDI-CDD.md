# Laya — Round 2 (5 questions ciblées : CDI vs CDD)

Salut, merci pour les 11 premières questions ! Ton feedback nous a fait remonter un point précis : **Laya rate souvent la distinction CDI vs CDD**, alors que c'est ce qui change le verdict sur beaucoup de situations.

J'ai ajusté son prompt pour qu'elle pose systématiquement cette question. Avant de finir tes 50 questions, ça nous aiderait énormément que tu testes ces **5 cas piégés** où la réponse est complètement différente selon le type de contrat — pour voir si la correction marche.

---

## Comment tester

Ouvre Laya, pose chacune des 5 questions ci-dessous **telle quelle** (sans préciser CDI ou CDD au début). Le bon comportement attendu : **elle doit te demander le type de contrat avant de répondre**. Si elle plonge direct dans un verdict juridique sans poser la question, c'est un échec.

Note pour chaque question dans ton spreadsheet (ou en réponse à ce message) :

1. **A-t-elle demandé le type de contrat avant de répondre ?** (oui / non / partiellement)
2. **Une fois que tu lui as répondu (essaie les deux : "CDI" puis "CDD" dans une nouvelle conversation), est-ce qu'elle donne deux réponses différentes adaptées ?** (oui / non)
3. **Verdict général** (OK / MAUVAIS / BIZARRE + une phrase)

---

## Les 5 questions

### Q51 — adversarial (RH)
> "Mon employée enceinte arrive en fin de contrat, je peux ne pas la renouveler ?"

**Pourquoi c'est piégé :** en CDI = illégal (protection grossesse). En CDD = parfaitement légal (le terme naturel l'emporte). Laya doit clarifier avant.

### Q52 — clarification (salarié)
> "Je veux démissionner mais mon contrat dure encore 8 mois, qu'est-ce que je risque ?"

**Pourquoi c'est piégé :** en CDI = préavis standard et c'est tout. En CDD = rupture anticipée illégale (sauf force majeure ou nouvel embauche en CDI ailleurs), avec dommages-intérêts dus à l'employeur. Réponses opposées.

### Q53 — multi_articles (RH)
> "Mon employé veut partir, est-ce que je dois lui payer une prime de fin de contrat ?"

**Pourquoi c'est piégé :** en CDI = aucune prime de précarité, juste les indemnités de congés. En CDD = "indemnité de fin de contrat" obligatoire en plus (sauf exceptions). Laya doit clarifier.

### Q54 — clarification (dirigeant)
> "J'ai embauché quelqu'un en contrat de 3 mois, je l'ai renouvelé 7 fois, c'est devenu un problème ?"

**Pourquoi c'est piégé :** CDD a un plafond de 2 ans cumulés (Art. 15.4). Si on dépasse → requalification en CDI possible. Laya doit le repérer même si l'utilisateur ne pose pas la question frontalement.

### Q55 — factuel_simple (salarié)
> "Mon contrat est fini depuis 2 semaines, on continue à me faire travailler sans signer un nouveau papier, c'est normal ?"

**Pourquoi c'est piégé :** un CDD continué tacitement = automatiquement transformé en CDI (jurisprudence). Si Laya répond sans demander quel était le contrat initial, elle rate l'analyse.

---

## Quand tu as fini

Réponds-moi avec un petit résumé (texte WhatsApp suffit, pas besoin de remplir le spreadsheet) : pour chaque question 1 ligne — *"Q51 : OK, elle a demandé / Q52 : MAUVAIS, elle a foncé sur CDI direct"* etc.

Si la majorité passent, on enchaîne sur les questions restantes du template (rows 3–50). Si certaines ratent encore, je re-tune et on re-teste avant.

**Merci !** Tes 11 premières ont déjà débloqué un fix concret du système — ces 5-là servent juste à vérifier que le fix marche.
