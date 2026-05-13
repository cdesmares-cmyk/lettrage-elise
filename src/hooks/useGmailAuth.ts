import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const REDIRECT_URI = 'https://aqxsqmgtmenjpfrblqoe.supabase.co/functions/v1/gmail-oauth-callback'
const SCOPE        = 'https://www.googleapis.com/auth/gmail.send openid email'

export interface GmailToken {
  access_token:  string
  refresh_token: string | null
  token_expiry:  string
  gmail_email:   string | null
}

// Encodage base64url pour le corps du message RFC 2822
function base64url(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Encodage base64 UTF-8 pour les en-têtes RFC 2822 (objet du mail)
function b64utf8(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  bytes.forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin)
}

export function useGmailAuth() {
  const { utilisateur }             = useAuth()
  const [token, setToken]           = useState<GmailToken | null>(null)
  const [chargement, setChargement] = useState(true)

  const chargerToken = useCallback(async () => {
    const uid = utilisateur?.id
    if (!uid) { setToken(null); setChargement(false); return }
    setChargement(true)
    const { data } = await supabase
      .from('gmail_tokens' as never)
      .select('access_token, refresh_token, token_expiry, gmail_email')
      .eq('user_id', uid)
      .maybeSingle()
    setToken((data as GmailToken | null) ?? null)
    setChargement(false)
  }, [utilisateur?.id])

  // Chargement du token au montage
  useEffect(() => { chargerToken() }, [chargerToken])

  // Détection du retour OAuth depuis Google (?gmail=connected dans l'URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('gmail') === 'connected') {
      window.history.replaceState({}, '', window.location.pathname)
      chargerToken()
    }
  }, [chargerToken])

  // Lance le flux OAuth Google pour connecter la boîte Gmail de l'opérateur
  function connecterGmail() {
    if (!utilisateur) return
    const state  = btoa(JSON.stringify({
      uid: utilisateur.id,
      url: window.location.origin + '/relances',
    }))
    const params = new URLSearchParams({
      client_id:     import.meta.env.VITE_GMAIL_CLIENT_ID ?? '',
      redirect_uri:  REDIRECT_URI,
      response_type: 'code',
      scope:         SCOPE,
      access_type:   'offline',
      prompt:        'consent', // nécessaire pour obtenir un refresh_token
      state,
    })
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  }

  // Retourne un access_token valide (rafraîchit si besoin)
  async function getTokenValide(): Promise<string | null> {
    if (!token) return null
    const margeMs = 5 * 60_000 // rafraîchir si expiration dans moins de 5 min
    if (new Date(token.token_expiry).getTime() - Date.now() < margeMs) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null
      const { data, error } = await supabase.functions.invoke('gmail-refresh-token', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (error || !data?.access_token) return null
      const updated: GmailToken = { ...token, access_token: data.access_token, token_expiry: data.token_expiry }
      setToken(updated)
      return updated.access_token
    }
    return token.access_token
  }

  // Envoie un email via Gmail API et retourne le threadId
  async function envoyerEmail(params: {
    destinataires: string[]
    objet:         string
    corpsHtml:     string
  }): Promise<{ threadId: string } | null> {
    const accessToken = await getTokenValide()
    if (!accessToken) return null

    const to      = params.destinataires.join(', ')
    const subject = `=?utf-8?B?${b64utf8(params.objet)}?=`

    // Message au format RFC 2822 encodé en base64url pour l'API Gmail
    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      params.corpsHtml,
    ].join('\r\n')

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ raw: base64url(message) }),
    })

    if (!res.ok) return null
    const data = await res.json()
    return { threadId: data.threadId }
  }

  return {
    token,
    chargement,
    estConnecte:   !!token,
    connecterGmail,
    envoyerEmail,
  }
}
