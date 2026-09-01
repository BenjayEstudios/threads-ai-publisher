require('dotenv').config();

async function main() {
    const token = process.env.THREADS_ACCESS_TOKEN;

    if (!token) {
        throw new Error('Falta THREADS_ACCESS_TOKEN');
    }

    const url = new URL(
        'https://graph.threads.net/v1.0/me'
    );

    url.searchParams.set(
        'fields',
        'id,username,name'
    );

    url.searchParams.set(
        'access_token',
        token
    );

    console.log('🔎 Consultando cuenta de Threads...');

    const response = await fetch(url);
    const data = await response.json();

    console.log('');

    if (!response.ok) {
        console.error('❌ Error:');
        console.error(
            JSON.stringify(data, null, 2)
        );
        process.exit(1);
    }

    console.log('✅ Cuenta asociada al token:');
    console.log(
        JSON.stringify(data, null, 2)
    );
}

main().catch(error => {
    console.error('❌', error.message);
    process.exit(1);
});