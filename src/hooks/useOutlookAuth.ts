import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { GmailToken } from './useGmailAuth'

const OUTLOOK_CLIENT_ID = '408a3edc-f8ab-4286-8e72-5720d42872d0'
const REDIRECT_URI      = 'https://aqxsqmgtmenjpfrblqoe.supabase.co/functions/v1/outlook-oauth-callback'
const SCOPE             = 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/MailboxSettings.Read openid email offline_access'

export interface OutlookToken {
  access_token:  string
  refresh_token: string | null
  token_expiry:  string
  outlook_email: string | null
  gmail_email:   string | null  // alias pour compatibilité GmailAuthProps
}

export function useOutlookAuth() {
  const { utilisateur }             = useAuth()
  const [token, setToken]           = useState<OutlookToken | null>(null)
  const [chargement, setChargement] = useState(true)

  const chargerToken = useCallback(async () => {
    const uid = utilisateur?.id
    if (!uid) { setToken(null); setChargement(false); return }
    setChargement(true)
    const { data } = await supabase
      .from('outlook_tokens' as never)
      .select('access_token, refresh_token, token_expiry, outlook_email')
      .eq('user_id', uid)
      .maybeSingle()
    if (data) {
      const row = data as { access_token: string; refresh_token: string | null; token_expiry: string; outlook_email: string | null }
      setToken({ ...row, gmail_email: row.outlook_email })
    } else {
      setToken(null)
    }
    setChargement(false)
  }, [utilisateur?.id])

  useEffect(() => { chargerToken() }, [chargerToken])

  // Détection du retour OAuth Microsoft (?outlook=connected dans l'URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('outlook') === 'connected') {
      window.history.replaceState({}, '', window.location.pathname)
      chargerToken()
    }
  }, [chargerToken])

  function connecterOutlook() {
    if (!utilisateur) return
    const state  = btoa(JSON.stringify({
      uid: utilisateur.id,
      url: window.location.origin + '/relances',
    }))
    const params = new URLSearchParams({
      client_id:     OUTLOOK_CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      response_type: 'code',
      scope:         SCOPE,
      response_mode: 'query',
      state,
    })
    window.location.href = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`
  }

  async function getTokenValide(): Promise<string | null> {
    if (!token) return null
    const margeMs = 5 * 60_000
    if (new Date(token.token_expiry).getTime() - Date.now() < margeMs) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return null
      const { data, error } = await supabase.functions.invoke('outlook-refresh-token', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (error || !data?.access_token) return null
      const updated: OutlookToken = { ...token, access_token: data.access_token, token_expiry: data.token_expiry }
      setToken(updated)
      return updated.access_token
    }
    return token.access_token
  }

  // Envoi via Microsoft Graph API (JSON pur, pas de base64 RFC 2822)
  async function envoyerEmail(params: {
    destinataires: string[]
    objet:         string
    corpsHtml:     string
    cc?:           string[]
  }): Promise<{ threadId: string } | null> {
    const accessToken = await getTokenValide()
    if (!accessToken) return null

    const message: Record<string, unknown> = {
      subject: params.objet,
      body: { contentType: 'HTML', content: params.corpsHtml },
      toRecipients: params.destinataires.map(a => ({ emailAddress: { address: a } })),
    }
    if (params.cc?.length) {
      message.ccRecipients = params.cc.map(a => ({ emailAddress: { address: a } }))
    }

    const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[outlook] sendMail error:', err)
      return null
    }
    // Graph API renvoie 202 sans body — on génère un threadId fictif pour la compatibilité
    return { threadId: `outlook-${Date.now()}` }
  }

  // Microsoft Graph n'expose pas la signature via API — retourne null
  async function recupererSignature(): Promise<string | null> {
    return null
  }

  async function deconnecterOutlook() {
    const uid = utilisateur?.id
    if (!uid) return
    await supabase.from('outlook_tokens' as never).delete().eq('user_id', uid)
    setToken(null)
  }

  return {
    token,
    chargement,
    estConnecte:      !!token,
    connecterOutlook,
    deconnecterOutlook,
    connecterGmail:   connecterOutlook,   // alias GmailAuthProps
    envoyerEmail,
    recupererSignature,
  }
}
