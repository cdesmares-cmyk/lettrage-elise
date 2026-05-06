import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

// Lecture des variables d'environnement injectées par Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variables Supabase manquantes. Vérifiez votre fichier .env')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
