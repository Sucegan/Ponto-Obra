const { createClient } = require('@supabase/supabase-js');

let client;

function getSupabase() {
    if (client) return client;

    const url = process.env.SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !secret) {
        const error = new Error('Configuração do Supabase ausente.');
        error.code = 'SUPABASE_NOT_CONFIGURED';
        throw error;
    }

    client = createClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return client;
}

module.exports = { getSupabase };
