import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iykytjkkvdywssdstyad.supabase.co';
const supabaseKey = 'sb_publishable_iT9oaIbTvn6CV0UQQMXfyw_Neh1B7iy';

export const supabase = createClient(supabaseUrl, supabaseKey);