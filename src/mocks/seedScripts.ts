// Seed call scripts (FR + EN) and email templates for mock mode. Short and
// practical; placeholders are substituted client-side.
import type { CallScript, EmailTemplate, ScriptLanguage, ScriptSection } from '../api/types'
import { mockId } from './seed'

type Sections = Record<'opening' | 'questions' | 'objections' | 'closing', string>

const TITLES: Record<ScriptLanguage, Record<keyof Sections, string>> = {
  fr: { opening: 'Ouverture', questions: 'Questions', objections: 'Objections', closing: 'Clôture' },
  en: { opening: 'Opening', questions: 'Questions', objections: 'Objections', closing: 'Closing' },
}

function sections(language: ScriptLanguage, s: Sections): ScriptSection[] {
  return (['opening', 'questions', 'objections', 'closing'] as const).map((key) => ({ key, title: TITLES[language][key], body: s[key].trim() }))
}

const FR_DEFAULT: Sections = {
  opening: `Bonjour {{decisionMaker}}, ici {{callerName}} de {{companyName}}, entreprise d’entretien ménager commercial à Montréal.

Je vous appelle parce que nous servons plusieurs entreprises à {{city}} et j’aimerais savoir comment se passe l’entretien chez {{businessName}} en ce moment. Vous avez deux minutes ?`,
  questions: `- Qui s’occupe de l’entretien actuellement : une firme ou quelqu’un à l’interne ?
- À quelle fréquence le ménage est-il fait ? Est-ce suffisant ?
- Qu’est-ce qui vous agace le plus avec la situation actuelle (qualité, prix, fiabilité, horaire, produits) ?
- Quand se termine votre contrat actuel ?
- Quelle superficie et combien d’employés environ ?
- Qui prend la décision finale pour ce genre de contrat ?`,
  objections: `On a déjà un fournisseur. → Parfait, la plupart de nos clients en avaient un aussi. Je vous propose simplement une comparaison : une visite de 15 minutes et un prix écrit, sans engagement.

On n’a pas de budget. → Je comprends. Notre soumission est gratuite et souvent plus basse que ce que les gens paient déjà, notamment grâce à la fréquence ajustée. Ça vaut le coup de comparer.

Envoyez-moi de l’information par courriel. → Avec plaisir. Pour que ce soit pertinent, puis-je vous poser deux questions sur vos locaux ? Et à quelle adresse je vous l’envoie ?

Ce n’est pas le bon moment. → Aucun problème. Quand serait un meilleur moment : la semaine prochaine, ou plutôt vers la fin de votre contrat ?

On fait le ménage nous-mêmes. → C’est courant. Souvent, confier le ménage libère du temps au personnel et coûte moins cher qu’on pense. Puis-je vous faire une estimation sans frais ?`,
  closing: `Je vous propose deux options : une courte visite pour une soumission précise, ou je vous envoie un devis estimatif par courriel aujourd’hui.

Quelle option vous convient le mieux ? Et quel est le meilleur courriel pour vous joindre ?

Merci {{decisionMaker}}, je vous envoie ça aujourd’hui et je vous rappelle dans quelques jours.`,
}

const EN_DEFAULT: Sections = {
  opening: `Hi {{decisionMaker}}, this is {{callerName}} from {{companyName}}, a commercial cleaning company based in Montreal.

I’m calling because we serve several businesses in {{city}} and I’d like to know how cleaning is going at {{businessName}} these days. Do you have two minutes?`,
  questions: `- Who handles cleaning today: a company or someone in-house?
- How often is cleaning done? Is that enough?
- What bothers you most about the current setup (quality, price, reliability, schedule, products)?
- When does your current contract end?
- Roughly what square footage and how many employees?
- Who makes the final decision on this kind of contract?`,
  objections: `We already have a provider. → Great, most of our clients did too. I’m only suggesting a comparison: a 15-minute visit and a written price, no commitment.

We don’t have the budget. → I understand. Our quote is free and often lower than what people already pay, mainly thanks to an adjusted frequency. It’s worth comparing.

Send me something by email. → Happy to. To make it relevant, may I ask two quick questions about your premises? And which address should I use?

It’s not a good time. → No problem. When would be better: next week, or closer to the end of your contract?

We clean ourselves. → That’s common. Outsourcing usually frees staff time and costs less than people expect. Can I send you a free estimate?`,
  closing: `I can offer two options: a short visit for a precise quote, or an estimate by email today.

Which works best for you? And what is the best email to reach you?

Thank you {{decisionMaker}}, I’ll send that today and call you back in a few days.`,
}

const FR_CPE: Sections = {
  opening: `Bonjour {{decisionMaker}}, {{callerName}} de {{companyName}}. Nous faisons l’entretien de plusieurs CPE et garderies à {{city}}, avec des produits sans parfum approuvés pour les milieux de garde.

J’aimerais savoir comment se passe l’entretien au {{businessName}}. Est-ce un bon moment, ou préférez-vous que je rappelle pendant la sieste ?`,
  questions: `- L’entretien est-il fait le soir après la fermeture ?
- Combien de locaux et de salles de bain ?
- Avez-vous des exigences de produits (sans parfum, désinfectants approuvés) ?
- Est-ce que le fournisseur actuel désinfecte les jouets et les surfaces de contact ?
- Quand se termine l’entente actuelle ? Le conseil d’administration est-il impliqué dans la décision ?`,
  objections: `C’est le CA qui décide. → Bien sûr. Puis-je vous envoyer une soumission claire que vous pourrez présenter à la prochaine rencontre du CA ?

On a des exigences très strictes. → C’est justement notre spécialité : produits sans parfum, désinfection des surfaces de contact, personnel vérifié. Je peux vous envoyer notre fiche de produits.

Le budget est serré. → Les CPE ont des budgets encadrés, je le sais. Nous ajustons la fréquence et le périmètre pour respecter le budget, sans sacrifier la désinfection.`,
  closing: `Je vous propose une visite de 15 minutes après la fermeture pour une soumission précise, ou un devis estimatif par courriel dès aujourd’hui pour votre CA.

Quel courriel dois-je utiliser ? Merci {{decisionMaker}}, bonne fin de journée avec les petits !`,
}

const EN_CPE: Sections = {
  opening: `Hi {{decisionMaker}}, {{callerName}} from {{companyName}}. We clean several daycares in {{city}}, using fragrance-free products approved for childcare settings.

I’d like to know how cleaning is going at {{businessName}}. Is this a good time, or should I call back during nap time?`,
  questions: `- Is cleaning done in the evening after closing?
- How many rooms and bathrooms?
- Do you have product requirements (fragrance-free, approved disinfectants)?
- Does the current provider disinfect toys and high-touch surfaces?
- When does the current agreement end? Is the board involved in the decision?`,
  objections: `The board decides. → Of course. Can I send you a clear quote you can bring to the next board meeting?

We have very strict requirements. → That is exactly our specialty: fragrance-free products, high-touch disinfection, vetted staff. I can send our product sheet.

The budget is tight. → Daycare budgets are regulated, I know. We adjust frequency and scope to fit the budget without cutting disinfection.`,
  closing: `I suggest a 15-minute visit after closing for a precise quote, or an estimate by email today for your board.

Which email should I use? Thank you {{decisionMaker}}, enjoy the rest of the day with the kids!`,
}

const FR_CLINIQUE: Sections = {
  opening: `Bonjour {{decisionMaker}}, {{callerName}} de {{companyName}}. Nous entretenons des cliniques à {{city}} avec des protocoles de désinfection adaptés aux milieux de soins.

Je vous appelle pour savoir comment se passe l’entretien à {{businessName}}. Avez-vous deux minutes ?`,
  questions: `- Combien de salles d’examen et de salles d’attente ?
- L’entretien est-il fait tous les soirs ? Avec des désinfectants de grade hospitalier ?
- Avez-vous déjà eu des problèmes de fiabilité ou de qualité ?
- Qui gère le contrat : la direction, le propriétaire ou le gestionnaire de l’immeuble ?
- Quand se termine votre entente actuelle ?`,
  objections: `C’est le propriétaire de l’immeuble qui gère ça. → Merci, pourriez-vous me donner son nom ? Je peux aussi vous préparer une offre pour l’intérieur de la clinique seulement.

On a des normes très strictes. → Nous suivons des protocoles de désinfection pour les milieux de soins et nous fournissons les fiches de nos produits. Je peux vous les envoyer.

On est satisfaits. → Tant mieux. Si jamais ça change, gardez notre offre : je vous l’envoie par courriel, sans engagement.`,
  closing: `Je peux passer 15 minutes entre deux patients pour une soumission précise, ou vous envoyer un devis estimatif aujourd’hui.

Quel courriel dois-je utiliser ? Merci {{decisionMaker}}, bonne journée.`,
}

const EN_CLINIQUE: Sections = {
  opening: `Hi {{decisionMaker}}, {{callerName}} from {{companyName}}. We clean clinics in {{city}} with disinfection protocols adapted to healthcare settings.

I’m calling to see how cleaning is going at {{businessName}}. Do you have two minutes?`,
  questions: `- How many exam rooms and waiting areas?
- Is cleaning done every evening? With hospital-grade disinfectants?
- Have you had reliability or quality issues?
- Who manages the contract: management, the owner or the building manager?
- When does your current agreement end?`,
  objections: `The building owner handles that. → Thanks, could you give me their name? I can also prepare an offer for the inside of the clinic only.

We have very strict standards. → We follow healthcare disinfection protocols and provide product sheets. I can send them to you.

We’re satisfied. → Glad to hear it. If that ever changes, keep our offer: I’ll email it, no commitment.`,
  closing: `I can stop by for 15 minutes between patients for a precise quote, or send an estimate today.

Which email should I use? Thank you {{decisionMaker}}, have a good day.`,
}

const FR_RESTAURANT: Sections = {
  opening: `Bonjour {{decisionMaker}}, {{callerName}} de {{companyName}}. Nous faisons l’entretien de restaurants à {{city}} : salle à manger, salles de bain et dégraissage de cuisine.

Je sais que c’est une période chargée — avez-vous deux minutes, ou je rappelle entre 14 h et 17 h ?`,
  questions: `- Qui fait le ménage de la salle et de la cuisine après le service ?
- Combien de places assises ? Y a-t-il une terrasse ?
- À quelle fréquence le dégraissage de la hotte et des planchers de cuisine est-il fait ?
- Avez-vous des exigences de la MAPAQ à respecter que l’entretien pourrait aider ?
- Qui décide : le propriétaire ou le gérant ?`,
  objections: `Mon équipe fait le ménage après le service. → C’est courant, mais ça coûte des heures de personnel fatigué. Un passage de nuit libère votre équipe et le résultat est plus constant.

On ferme tard, c’est compliqué. → Nous travaillons de nuit et tôt le matin. Dites-moi votre heure de fermeture et je m’organise.

Trop cher pour un resto. → Nos forfaits sont ajustés à la fréquence : parfois juste cuisine et salles de bain. Laissez-moi vous faire un prix.`,
  closing: `Je peux passer avant le service pour une soumission précise, ou vous envoyer un devis estimatif aujourd’hui.

Quel courriel dois-je utiliser ? Merci {{decisionMaker}}, bon service !`,
}

const EN_RESTAURANT: Sections = {
  opening: `Hi {{decisionMaker}}, {{callerName}} from {{companyName}}. We clean restaurants in {{city}}: dining room, restrooms and kitchen degreasing.

I know it’s a busy time — do you have two minutes, or should I call back between 2 and 5 pm?`,
  questions: `- Who cleans the dining room and kitchen after service?
- How many seats? Is there a patio?
- How often are the hood and kitchen floors degreased?
- Any MAPAQ requirements that better cleaning could help with?
- Who decides: the owner or the manager?`,
  objections: `My team cleans after service. → Common, but it costs tired staff hours. A night visit frees your team and the result is more consistent.

We close late, it’s complicated. → We work nights and early mornings. Tell me your closing time and I’ll work around it.

Too expensive for a restaurant. → Our packages follow the frequency: sometimes just kitchen and restrooms. Let me give you a price.`,
  closing: `I can stop by before service for a precise quote, or send an estimate today.

Which email should I use? Thank you {{decisionMaker}}, enjoy the service!`,
}

const FR_BUREAU: Sections = {
  opening: `Bonjour {{decisionMaker}}, {{callerName}} de {{companyName}}. Nous entretenons des bureaux professionnels à {{city}} — soir ou tôt le matin, sans déranger vos équipes.

Je vous appelle pour savoir comment se passe l’entretien chez {{businessName}}. Deux minutes ?`,
  questions: `- Combien de postes de travail et d’employés ?
- Est-ce que l’entretien est inclus dans votre bail, ou géré par vous ?
- À quelle fréquence est-il fait ? Les salles de bain et la cuisinette sont-elles satisfaisantes ?
- Avez-vous des salles de conférence ou des zones clients à soigner ?
- Quand se termine votre contrat actuel ?`,
  objections: `C’est inclus dans le bail. → Bon à savoir. Souvent, les locataires ajoutent un service complémentaire pour les zones clients ou la désinfection. Puis-je vous laisser notre carte ?

On est satisfaits de notre fournisseur. → Tant mieux. Je vous envoie une offre par courriel pour comparaison au moment du renouvellement, sans engagement.

Trop petit comme bureau. → Nous avons des forfaits à partir d’un passage par semaine, justement pour les petits bureaux.`,
  closing: `Je peux passer 15 minutes pour une soumission précise, ou vous envoyer un devis estimatif aujourd’hui.

Quel courriel dois-je utiliser ? Merci {{decisionMaker}}, bonne journée.`,
}

const EN_BUREAU: Sections = {
  opening: `Hi {{decisionMaker}}, {{callerName}} from {{companyName}}. We clean professional offices in {{city}} — evenings or early mornings, without disturbing your team.

I’m calling to see how cleaning is going at {{businessName}}. Two minutes?`,
  questions: `- How many workstations and employees?
- Is cleaning included in your lease, or managed by you?
- How often is it done? Are restrooms and the kitchenette satisfactory?
- Any conference rooms or client areas that need extra care?
- When does your current contract end?`,
  objections: `It’s included in the lease. → Good to know. Tenants often add a complementary service for client areas or disinfection. May I leave you our card?

We’re happy with our provider. → Glad to hear it. I’ll email an offer to compare at renewal time, no commitment.

Our office is too small. → We have packages from one visit a week, precisely for small offices.`,
  closing: `I can stop by for 15 minutes for a precise quote, or send an estimate today.

Which email should I use? Thank you {{decisionMaker}}, have a good day.`,
}

const FR_CHANTIER: Sections = {
  opening: `Bonjour {{decisionMaker}}, {{callerName}} de {{companyName}}. Nous faisons le nettoyage après construction à {{city}} : poussière fine, vitres, planchers, prêt à livrer.

J’ai vu que des travaux sont en cours chez {{businessName}}. Avez-vous déjà prévu le nettoyage de fin de chantier ?`,
  questions: `- Quelle est la date de livraison prévue ?
- Quelle superficie approximative ? Combien d’étages ?
- Le nettoyage de fin de chantier est-il déjà au contrat de l’entrepreneur ?
- Y a-t-il des vitres ou des surfaces délicates ?
- Qui coordonne la livraison : vous, l’entrepreneur ou le gestionnaire de projet ?`,
  objections: `L’entrepreneur s’en occupe. → Souvent, l’entrepreneur sous-traite justement ce nettoyage. Puis-je avoir son nom pour lui faire une offre ?

C’est trop tôt. → Justement, c’est le bon moment pour réserver la date : nos équipes de fin de chantier se remplissent vite. Je vous rappelle quand ?

On veut un prix ferme. → Avec plaisir : une visite de 20 minutes sur le chantier et vous avez un prix ferme par écrit.`,
  closing: `Je vous propose une visite sur le chantier pour un prix ferme, ou un devis estimatif par courriel aujourd’hui.

Quel courriel dois-je utiliser ? Merci {{decisionMaker}}, bonne fin de chantier.`,
}

const EN_CHANTIER: Sections = {
  opening: `Hi {{decisionMaker}}, {{callerName}} from {{companyName}}. We do post-construction cleaning in {{city}}: fine dust, windows, floors, ready to hand over.

I saw work is underway at {{businessName}}. Have you planned the final clean yet?`,
  questions: `- What is the planned delivery date?
- Approximate square footage? How many floors?
- Is the final clean already in the contractor’s contract?
- Any windows or delicate surfaces?
- Who coordinates delivery: you, the contractor or the project manager?`,
  objections: `The contractor handles it. → Contractors often subcontract exactly this clean. May I have their name to make them an offer?

It’s too early. → That’s actually the right time to book the date: our post-construction crews fill up fast. When should I call back?

We want a firm price. → Gladly: a 20-minute site visit and you get a firm written price.`,
  closing: `I suggest a site visit for a firm price, or an estimate by email today.

Which email should I use? Thank you {{decisionMaker}}, good luck with the hand-over.`,
}

export function makeScripts(now: Date): CallScript[] {
  const updated = new Date(now)
  updated.setDate(updated.getDate() - 12)
  const updatedAt = updated.toISOString().slice(0, 19)
  const def = (name: string, businessType: string | null, language: ScriptLanguage, s: Sections): CallScript => ({
    id: mockId('sc'),
    name,
    businessType,
    language,
    sections: sections(language, s),
    active: true,
    updatedAt,
  })
  return [
    def('Script par défaut', null, 'fr', FR_DEFAULT),
    def('Default script', null, 'en', EN_DEFAULT),
    def('CPE et garderies', 'CPE', 'fr', FR_CPE),
    def('Daycares', 'CPE', 'en', EN_CPE),
    def('Cliniques', 'Clinique', 'fr', FR_CLINIQUE),
    def('Clinics', 'Clinique', 'en', EN_CLINIQUE),
    def('Restaurants', 'Restaurant', 'fr', FR_RESTAURANT),
    def('Restaurants', 'Restaurant', 'en', EN_RESTAURANT),
    def('Bureaux', 'Bureau', 'fr', FR_BUREAU),
    def('Offices', 'Bureau', 'en', EN_BUREAU),
    def('Chantiers', 'Chantier', 'fr', FR_CHANTIER),
    def('Construction sites', 'Chantier', 'en', EN_CHANTIER),
  ]
}

/** Best match: exact type + language, else the type's family (CPE ⊃ Garderie, Clinique ⊃ Clinique dentaire…), else default. */
export function pickScript(scripts: CallScript[], businessType: string | null, language: ScriptLanguage): CallScript {
  const active = scripts.filter((s) => s.active !== false && s.language === language)
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const t = businessType ? norm(businessType) : ''
  const exact = t ? active.find((s) => s.businessType && norm(s.businessType) === t) : undefined
  if (exact) return { ...exact, fallback: false }
  const FAMILY: Record<string, RegExp> = {
    cpe: /cpe|garderie|daycare/,
    clinique: /clinique|clinic|chsld|dentaire|medical|gmf/,
    restaurant: /restaurant|resto|bistro|cafe/,
    bureau: /bureau|office|cabinet/,
    chantier: /chantier|construction|permis/,
  }
  const family = t ? active.find((s) => s.businessType && FAMILY[norm(s.businessType)]?.test(t)) : undefined
  if (family) return { ...family, fallback: false }
  const def = active.find((s) => s.businessType === null) ?? scripts.find((s) => s.businessType === null && s.language === language)!
  return { ...def, fallback: true }
}

// ---- Email templates

export function makeEmailTemplates(): EmailTemplate[] {
  const t = (key: EmailTemplate['key'], language: ScriptLanguage, subject: string, body: string): EmailTemplate => ({
    id: mockId('et'),
    key,
    language,
    subject,
    body: body.trim(),
    active: true,
  })
  return [
    t('intro', 'fr', '{{companyName}} — entretien commercial pour {{businessName}}', `Bonjour {{decisionMaker}},

Merci pour notre conversation d’aujourd’hui. Comme promis, voici un aperçu de ce que {{companyName}} peut offrir à {{businessName}} : entretien régulier le soir ou tôt le matin, produits écoresponsables, personnel vérifié, et un seul point de contact.

{{estimate}}{{extraNote}}
Je reste disponible pour une visite rapide des lieux ou pour toute question.

Cordialement,
{{callerName}}
{{companyName}}`),
    t('intro', 'en', '{{companyName}} — commercial cleaning for {{businessName}}', `Hello {{decisionMaker}},

Thank you for our conversation today. As promised, here is an overview of what {{companyName}} can offer {{businessName}}: regular cleaning in the evening or early morning, eco-friendly products, vetted staff and a single point of contact.

{{estimate}}{{extraNote}}
I remain available for a quick visit of the premises or any question.

Best regards,
{{callerName}}
{{companyName}}`),
    t('quote_followup', 'fr', 'Votre estimation {{companyName}} — {{businessName}}', `Bonjour {{decisionMaker}},

Suite à notre échange, voici l’estimation pour l’entretien de {{businessName}} :

{{estimate}}
Les prix sont avant taxes et confirmés après une courte visite des lieux. {{extraNote}}
Puis-je vous proposer une date pour cette visite ?

Cordialement,
{{callerName}}
{{companyName}}`),
    t('quote_followup', 'en', 'Your {{companyName}} estimate — {{businessName}}', `Hello {{decisionMaker}},

Following our conversation, here is the estimate for cleaning {{businessName}}:

{{estimate}}
Prices are before taxes and confirmed after a short visit of the premises. {{extraNote}}
May I suggest a date for that visit?

Best regards,
{{callerName}}
{{companyName}}`),
    t('visit_confirmation', 'fr', 'Confirmation de visite — {{businessName}}', `Bonjour {{decisionMaker}},

Je confirme notre visite des lieux de {{businessName}} le {{visitAt}}. Comptez environ 15 minutes ; j’aurai une soumission écrite pour vous dans les 24 heures qui suivent.

{{extraNote}}
Une invitation de calendrier est jointe à ce courriel. Si l’heure ne convient plus, répondez simplement à ce message.

À bientôt,
{{callerName}}
{{companyName}}`),
    t('visit_confirmation', 'en', 'Visit confirmation — {{businessName}}', `Hello {{decisionMaker}},

I confirm our visit of {{businessName}} on {{visitAt}}. Plan for about 15 minutes; you will have a written quote within 24 hours.

{{extraNote}}
A calendar invitation is attached to this email. If the time no longer works, simply reply to this message.

See you soon,
{{callerName}}
{{companyName}}`),
    t('missed_you', 'fr', 'J’ai tenté de vous joindre — {{businessName}}', `Bonjour {{decisionMaker}},

J’ai essayé de vous joindre aujourd’hui au sujet de l’entretien de {{businessName}}, sans succès. {{companyName}} entretient plusieurs entreprises de votre secteur et j’aimerais vous proposer une comparaison sans engagement.

{{extraNote}}
Quel serait le meilleur moment pour vous rappeler ? Vous pouvez aussi simplement répondre à ce courriel.

Cordialement,
{{callerName}}
{{companyName}}`),
    t('missed_you', 'en', 'Tried to reach you — {{businessName}}', `Hello {{decisionMaker}},

I tried to reach you today about cleaning at {{businessName}}, without luck. {{companyName}} serves several businesses in your area and I’d like to offer a no-commitment comparison.

{{extraNote}}
When would be a good time to call you back? You can also simply reply to this email.

Best regards,
{{callerName}}
{{companyName}}`),
  ]
}
