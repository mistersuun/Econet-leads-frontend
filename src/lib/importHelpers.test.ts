import { describe, expect, it } from 'vitest'
import {
  cleanMapping,
  countMissing,
  defaultSourceName,
  importCounts,
  parseDelimited,
  pasteToCsv,
  previewRows,
  sniffDelimiter,
  suggestMapping,
} from './importHelpers'

describe('sniffDelimiter', () => {
  it('detects tabs, semicolons and commas', () => {
    expect(sniffDelimiter('Nom\tTéléphone\nA\t514')).toBe('\t')
    expect(sniffDelimiter('Nom;Téléphone;Ville\nA;514;X')).toBe(';')
    expect(sniffDelimiter('Nom,Téléphone,Ville\nA,514,X')).toBe(',')
  })
  it('ignores delimiters inside quotes', () => {
    expect(sniffDelimiter('"Nom, prénom";Ville\nA;B')).toBe(';')
  })
})

describe('parseDelimited', () => {
  it('handles quotes, doubled quotes, CRLF and blank lines', () => {
    const rows = parseDelimited('a,b\r\n"x, y","he said ""hi"""\r\n\r\n1,2\r\n')
    expect(rows).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['1', '2']])
  })
  it('keeps newlines inside quoted cells', () => {
    expect(parseDelimited('a,b\n"l1\nl2",x')).toEqual([['a', 'b'], ['l1\nl2', 'x']])
  })
})

describe('pasteToCsv', () => {
  it('converts tab-separated Excel text to CSV', () => {
    const res = pasteToCsv('Nom\tTéléphone\tVille\nCPE Soleil\t514 555-1234\tLaval\nGarderie A, B\t\tMontréal\n')
    expect(res).not.toBeNull()
    expect(res!.rowCount).toBe(2)
    expect(res!.columns).toEqual(['Nom', 'Téléphone', 'Ville'])
    expect(res!.csv).toBe('Nom,Téléphone,Ville\r\nCPE Soleil,514 555-1234,Laval\r\n"Garderie A, B",,Montréal\r\n')
  })
  it('re-quotes commas and pads short rows', () => {
    const res = pasteToCsv('Nom;Tel;Notes\nA;1\nB;2;"x;y"')
    expect(res!.csv).toBe('Nom,Tel,Notes\r\nA,1,\r\nB,2,x;y\r\n')
  })
  it('names blank headers and needs a header plus one row', () => {
    expect(pasteToCsv('Nom\t\nA\tB')!.columns).toEqual(['Nom', 'Colonne 2'])
    expect(pasteToCsv('Nom\tTel')).toBeNull()
    expect(pasteToCsv('  \n ')).toBeNull()
  })
})

describe('suggestMapping', () => {
  it('maps French and English headers regardless of accents and case', () => {
    const m = suggestMapping(['Entreprise', 'TÉLÉPHONE', 'Ville', 'Adresse', 'Courriel', 'Site web', 'Catégorie', 'Code postal', 'Commentaire', 'Responsable'])
    expect(m).toEqual({
      businessName: 'Entreprise',
      phone: 'TÉLÉPHONE',
      addressCity: 'Ville',
      addressStreet: 'Adresse',
      email: 'Courriel',
      website: 'Site web',
      businessType: 'Catégorie',
      postalCode: 'Code postal',
      notes: 'Commentaire',
      decisionMaker: 'Responsable',
    })
  })
  it('does not use one column twice and leaves unknown fields null', () => {
    const m = suggestMapping(['Name', 'Phone', 'Foo'])
    expect(m.businessName).toBe('Name')
    expect(m.phone).toBe('Phone')
    expect(m.email).toBeNull()
    expect(m.addressStreet).toBeNull()
  })
  it('lets "code postal" win over "adresse"-like headers', () => {
    const m = suggestMapping(['Nom', 'Adresse postale', 'Code postal'])
    expect(m.postalCode).toBe('Code postal')
    expect(m.addressStreet).toBe('Adresse postale')
  })
})

describe('preview and counts', () => {
  const columns = ['Nom', 'Tel', 'Ville']
  const rows = [
    ['CPE A', '5145551234', 'Laval'],
    ['', '5145550000', 'Laval'],
    ['Clinique B', '', ''],
    ['  ', ' ', 'X'],
  ]
  const mapping = { businessName: 'Nom', phone: 'Tel', addressCity: 'Ville', email: null }
  it('previews the mapped fields only', () => {
    expect(previewRows(columns, rows.slice(0, 1), mapping)).toEqual([{ businessName: 'CPE A', phone: '5145551234', addressCity: 'Laval' }])
  })
  it('counts rows missing a name or a phone, treating whitespace as empty', () => {
    expect(countMissing(columns, rows, mapping)).toEqual({ total: 4, missingName: 2, missingPhone: 2 })
  })
  it('counts everything as missing when the field is unmapped', () => {
    expect(countMissing(columns, rows, { businessName: 'Nom' })).toEqual({ total: 4, missingName: 2, missingPhone: 4 })
  })
  it('cleans unmapped fields', () => {
    expect(cleanMapping(mapping)).toEqual({ businessName: 'Nom', phone: 'Tel', addressCity: 'Ville' })
  })
})

describe('importCounts', () => {
  it('reads skipped/invalid from the log summary', () => {
    expect(importCounts({ recordsAdded: 12, recordsUpdated: 3, log: 'Terminé : 12 ajoutées, 3 mises à jour, 2 ignorées, 1 invalide' })).toEqual({ added: 12, updated: 3, skipped: 2, invalid: 1 })
    expect(importCounts({ recordsAdded: 1, recordsUpdated: 0, log: 'processed=10 added=1 skipped: 4 invalid: 5' })).toEqual({ added: 1, updated: 0, skipped: 4, invalid: 5 })
  })
  it('prefers explicit fields and defaults to zero', () => {
    expect(importCounts({ recordsAdded: null, recordsUpdated: null, skipped: 7, invalid: 0, log: '9 skipped' })).toEqual({ added: 0, updated: 0, skipped: 7, invalid: 0 })
    expect(importCounts({ recordsAdded: 2, recordsUpdated: 1 })).toEqual({ added: 2, updated: 1, skipped: 0, invalid: 0 })
  })
})

describe('defaultSourceName', () => {
  it('strips the extension', () => {
    expect(defaultSourceName('garderies_laval.xlsx')).toBe('garderies laval')
    expect(defaultSourceName('.csv')).toBe('Fichier')
  })
})
