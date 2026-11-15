import { ApiError } from '../api/client'

/** Exact English messages (from older servers or the framework) and their French wording. */
const EXACT: Record<string, string> = {
  'Invalid username or password': "Nom d'utilisateur ou mot de passe invalide",
  Unauthorized: 'Non autorisé',
  'Access denied': 'Accès refusé',
  Forbidden: 'Accès refusé',
  'Not Found': 'Ressource introuvable',
  'Validation failed': 'Validation échouée',
  'Internal server error': 'Erreur interne du serveur, réessayez dans un instant',
  'Malformed request body': 'Requête mal formée',
  'Account is disabled': 'Compte désactivé',
  'Invalid refresh token': 'Session expirée, reconnectez-vous',
  'Not authenticated': 'Non authentifié',
  'Username is already taken': "Ce nom d'utilisateur est déjà utilisé",
  'Email is already in use': 'Ce courriel est déjà utilisé',
  'Failed to fetch': 'Impossible de joindre le serveur. Vérifiez votre connexion.',
  'Network request failed': 'Impossible de joindre le serveur. Vérifiez votre connexion.',
}

/** Patterns for messages that embed a name or an id. */
const PATTERNS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Lead not found/i, () => 'Lead introuvable'],
  [/^(Business|Entreprise) not found/i, () => 'Entreprise introuvable'],
  [/^User not found/i, () => 'Utilisateur introuvable'],
  [/^Contact not found/i, () => 'Contact introuvable'],
  [/^Tender not found/i, () => "Appel d'offres introuvable"],
  [/not found/i, () => 'Ressource introuvable'],
  [/Duplicate business already exists/i, () => 'Cette entreprise existe déjà'],
  [/^Email is not configured/i, () => 'Courriel non configuré'],
  [/Email limit reached/i, () => 'Limite de courriels atteinte pour cette heure'],
  [/^(\w+) is required$/i, () => 'Un champ obligatoire est manquant'],
  [/must not exceed (\d+) characters/i, (m) => `Texte trop long (${m[1]} caractères maximum)`],
  [/at least (\d+) characters/i, (m) => `Au moins ${m[1]} caractères sont requis`],
  [/Failed to fetch|NetworkError|Load failed/i, () => 'Impossible de joindre le serveur. Vérifiez votre connexion.'],
]

const BY_STATUS: Record<number, string> = {
  400: 'Requête invalide.',
  401: 'Session expirée, veuillez vous reconnecter.',
  403: "Vous n'avez pas les droits pour cette action.",
  404: 'Ressource introuvable.',
  409: "Conflit avec l'état actuel des données.",
  429: 'Trop de requêtes, réessayez dans un instant.',
  500: 'Erreur interne du serveur, réessayez dans un instant.',
  502: 'Le service externe ne répond pas, réessayez dans un instant.',
  503: "Ce service n'est pas disponible ou pas configuré.",
}

const FRENCH_HINT = /[àâçéèêëîïôûùüÿœ«»]|\b(le|la|les|un|une|des|est|pour|dans|ne|pas|du|vous|votre|sur)\b/i

const ENGLISH_HINT = /\b(the|is|are|be|must|could|should|not|invalid|missing|required|empty|or|and|of|to|at|for|cannot|failed|error|found|limit|exceed)\b/i

/**
 * French fallback for server messages. French messages pass through unchanged; known English ones
 * are mapped; an unknown English message falls back to a generic sentence for its HTTP status.
 */
export function frenchMessage(message: string, status?: number): string {
  const text = message.trim()
  if (!text) return (status && BY_STATUS[status]) || 'Une erreur inattendue est survenue.'
  if (EXACT[text]) return EXACT[text]
  if (/^Erreur \d+$/.test(text)) return (status && BY_STATUS[status]) || text
  if (FRENCH_HINT.test(text)) return text
  for (const [re, fn] of PATTERNS) {
    const m = re.exec(text)
    if (m) return fn(m)
  }
  // Unknown and English-looking: a generic French sentence for the status beats raw English.
  if (ENGLISH_HINT.test(text)) return (status && BY_STATUS[status]) || text
  return text
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return frenchMessage(error.message, error.status)
  if (error instanceof Error) return frenchMessage(error.message)
  return 'Une erreur inattendue est survenue.'
}
