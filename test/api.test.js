const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../api/index');

let servidor;
let baseUrl;

test.before(async () => {
    servidor = app.listen(0);
    await new Promise((resolve) => servidor.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${servidor.address().port}`;
});

test.after(() => servidor.close());

test('rejeita uma data impossível antes de consultar o banco', async () => {
    const resposta = await fetch(`${baseUrl}/api/ponto?data=2026-02-31`);
    assert.equal(resposta.status, 400);
    assert.deepEqual(await resposta.json(), { error: 'Data inválida.' });
});

test('rejeita cadastro inconsistente', async () => {
    const resposta = await fetch(`${baseUrl}/api/funcionarios`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nome: 'A', cargo: 'Pedreiro', valor_diaria: -10 })
    });
    assert.equal(resposta.status, 400);
});

test('rejeita JSON inválido com erro de requisição', async () => {
    const resposta = await fetch(`${baseUrl}/api/funcionarios`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{'
    });
    assert.equal(resposta.status, 400);
    assert.deepEqual(await resposta.json(), { error: 'JSON inválido.' });
});

test('rejeita intervalo invertido no relatório', async () => {
    const resposta = await fetch(`${baseUrl}/api/relatorio?inicio=2026-09-10&fim=2026-09-01`);
    assert.equal(resposta.status, 400);
});

test('informa quando o Supabase ainda não foi configurado', async () => {
    const resposta = await fetch(`${baseUrl}/api/health`);
    assert.equal(resposta.status, 503);
    assert.deepEqual(await resposta.json(), { error: 'Banco de dados ainda não configurado.' });
});

test('exporta o servidor sem iniciar uma porta ao ser importado', () => {
    const servidor = require('../server');
    assert.equal(typeof servidor, 'function');
});
