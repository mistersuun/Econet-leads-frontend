import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { errorMessage, frenchMessage } from './errors'

describe('errors', () => {
  it('keeps French messages as they are', () => {
    expect(frenchMessage("Nom d'utilisateur ou mot de passe invalide", 401)).toBe("Nom d'utilisateur ou mot de passe invalide")
    expect(frenchMessage('Le mot de passe actuel est incorrect', 400)).toBe('Le mot de passe actuel est incorrect')
  })
  it('maps known English messages', () => {
    expect(frenchMessage('Invalid username or password')).toBe("Nom d'utilisateur ou mot de passe invalide")
    expect(frenchMessage('Lead not found: 123')).toBe('Lead introuvable')
    expect(frenchMessage('Email limit reached: at most 20 emails per hour per user')).toBe('Limite de courriels atteinte pour cette heure')
    expect(frenchMessage('Notes must not exceed 5000 characters')).toBe('Texte trop long (5000 caractères maximum)')
  })
  it('falls back to a generic sentence for the status code', () => {
    expect(frenchMessage('Erreur 500', 500)).toBe('Erreur interne du serveur, réessayez dans un instant.')
    expect(frenchMessage('', 403)).toBe("Vous n'avez pas les droits pour cette action.")
  })
  it('translates ApiError and plain Error', () => {
    expect(errorMessage(new ApiError('Access denied', 403))).toBe('Accès refusé')
    expect(errorMessage(new Error('Failed to fetch'))).toBe('Impossible de joindre le serveur. Vérifiez votre connexion.')
    expect(errorMessage('x')).toBe('Une erreur inattendue est survenue.')
  })
})
