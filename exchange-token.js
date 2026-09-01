require('dotenv').config();

async function main() {
    const shortLivedToken = process.env.THREADS_ACCESS_TOKEN;
    const appSecret = process.env.THREADS_APP_SECRET;

    if (!shortLivedToken) {
        throw new Error('Falta THREADS_ACCESS_TOKEN en .env');
    }

    if (!appSecret) {
        throw new Error('Falta THREADS_APP_SECRET en .env');
    }

    const url = new URL(
        'https://graph.threads.net/access_token'
    );

    url.searchParams.set(
        'grant_type',
        'th_exchange_token'
    );

    url.searchParams.set(
        'client_secret',
        appSecret
    );

    url.searchParams.set(
        'access_token',
        shortLivedToken
    );

    console.log('🔄 Intercambiando token...');

    const response = await fetch(url);

    const data = await response.json();

    if (!response.ok) {
        console.error('❌ Error de Threads:');
        console.error(JSON.stringify(data, null, 2));
        process.exit(1);
    }

    console.log('');
    console.log('✅ TOKEN DE LARGA DURACIÓN GENERADO');
    console.log('');
    console.log('Token:');
    console.log(data.access_token);
    console.log('');
    console.log('Tipo:', data.token_type);
    console.log('Expira en:', data.expires_in, 'segundos');
    console.log('');
}

main().catch(error => {
    console.error('❌', error.message);
    process.exit(1);
});