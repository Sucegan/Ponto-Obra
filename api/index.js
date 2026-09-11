const express = require('express');
const { getSupabase } = require('../lib/supabase');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

const STATUS_VALIDOS = new Set(['Trabalhou', 'Falta', 'Feriado']);
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MES_RE = /^\d{4}-\d{2}$/;

function dataValida(valor) {
    if (!DATA_RE.test(valor || '')) return false;
    const [ano, mes, dia] = valor.split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

function idValido(valor) {
    return Number.isInteger(Number(valor)) && Number(valor) > 0;
}

function mesValido(valor) {
    if (!MES_RE.test(valor)) return false;
    const numeroMes = Number(valor.slice(5));
    return numeroMes >= 1 && numeroMes <= 12;
}

function falhaSupabase(error) {
    const falha = new Error('Não foi possível acessar o banco de dados.');
    falha.cause = error;
    return falha;
}

function respostaErroBanco(error) {
    if (error?.code === '23505') return { status: 409, mensagem: 'Já existe um registro igual.' };
    if (error?.code === '23503') return { status: 409, mensagem: 'O funcionário informado não existe.' };
    return null;
}

function corpoObjeto(body) {
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

async function registrarAuditoria(supabase, entidade, entidadeId, acao, detalhes = {}) {
    const { error } = await supabase.from('auditoria').insert({ entidade, entidade_id: entidadeId, acao, detalhes });
    if (error) throw falhaSupabase(error);
}

async function buscarEquipe(supabase) {
    const { data, error } = await supabase
        .from('funcionarios')
        .select('id,nome,cargo,valor_diaria,ativo')
        .eq('ativo', true)
        .order('nome', { ascending: true });
    if (error) throw falhaSupabase(error);
    return data || [];
}

app.get('/api/health', async (_req, res, next) => {
    try {
        const { error } = await getSupabase().from('funcionarios').select('id').limit(1);
        if (error) throw falhaSupabase(error);
        res.json({ ok: true });
    } catch (error) { next(error); }
});

app.get('/api/funcionarios', async (_req, res, next) => {
    try { res.json(await buscarEquipe(getSupabase())); }
    catch (error) { next(error); }
});

app.post('/api/funcionarios', async (req, res, next) => {
    try {
        const body = corpoObjeto(req.body);
        const nome = String(body.nome || '').trim();
        const cargo = String(body.cargo || '').trim() || 'Operário';
        const valorDiaria = Number(body.valor_diaria);
        if (nome.length < 2 || nome.length > 120 || cargo.length > 80 || !Number.isFinite(valorDiaria) || valorDiaria <= 0 || valorDiaria > 1000000) {
            return res.status(400).json({ error: 'Preencha nome, cargo e valor da diária corretamente.' });
        }

        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('funcionarios')
            .insert({ nome, cargo, valor_diaria: valorDiaria })
            .select('id,nome,cargo,valor_diaria,ativo')
            .single();
        if (error) throw falhaSupabase(error);
        await registrarAuditoria(supabase, 'funcionarios', data.id, 'criado', { nome, cargo, valor_diaria: valorDiaria });
        res.status(201).json(data);
    } catch (error) { next(error); }
});

app.put('/api/funcionarios/:id', async (req, res, next) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ error: 'Funcionário inválido.' });
        const body = corpoObjeto(req.body);
        const nome = String(body.nome || '').trim();
        const cargo = String(body.cargo || '').trim() || 'Operário';
        const valorDiaria = Number(body.valor_diaria);
        if (nome.length < 2 || nome.length > 120 || cargo.length > 80 || !Number.isFinite(valorDiaria) || valorDiaria <= 0 || valorDiaria > 1000000) {
            return res.status(400).json({ error: 'Preencha nome, cargo e valor da diária corretamente.' });
        }
        const supabase = getSupabase();
        const { data, error } = await supabase.from('funcionarios')
            .update({ nome, cargo, valor_diaria: valorDiaria })
            .eq('id', Number(req.params.id)).eq('ativo', true)
            .select('id,nome,cargo,valor_diaria,ativo').maybeSingle();
        if (error) throw falhaSupabase(error);
        if (!data) return res.status(404).json({ error: 'Funcionário não encontrado.' });
        await registrarAuditoria(supabase, 'funcionarios', data.id, 'alterado', { nome, cargo, valor_diaria: valorDiaria });
        res.json(data);
    } catch (error) { next(error); }
});

app.delete('/api/funcionarios/:id', async (req, res, next) => {
    try {
        if (!idValido(req.params.id)) return res.status(400).json({ error: 'Funcionário inválido.' });
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('funcionarios')
            .update({ ativo: false })
            .eq('id', Number(req.params.id))
            .eq('ativo', true)
            .select('id');
        if (error) throw falhaSupabase(error);
        if (!data?.length) return res.status(404).json({ error: 'Funcionário não encontrado.' });
        await registrarAuditoria(supabase, 'funcionarios', Number(req.params.id), 'desativado');
        res.json({ message: 'Funcionário desativado.' });
    } catch (error) { next(error); }
});

app.get('/api/ponto', async (req, res, next) => {
    try {
        if (!dataValida(req.query.data)) return res.status(400).json({ error: 'Data inválida.' });
        const { data, error } = await getSupabase()
            .from('ponto')
            .select('funcionario_id,status')
            .eq('data', req.query.data);
        if (error) throw falhaSupabase(error);
        res.json(data || []);
    } catch (error) { next(error); }
});

app.post('/api/ponto', async (req, res, next) => {
    try {
        const { data, funcionario_id: funcionarioId, status } = corpoObjeto(req.body);
        if (!dataValida(data) || !idValido(funcionarioId) || !STATUS_VALIDOS.has(status)) {
            return res.status(400).json({ error: 'Dados do ponto inválidos.' });
        }
        const supabase = getSupabase();
        const { data: funcionario, error: erroFuncionario } = await supabase
            .from('funcionarios')
            .select('id')
            .eq('id', Number(funcionarioId))
            .eq('ativo', true)
            .maybeSingle();
        if (erroFuncionario) throw falhaSupabase(erroFuncionario);
        if (!funcionario) return res.status(404).json({ error: 'Funcionário ativo não encontrado.' });

        const { data: registro, error } = await supabase
            .from('ponto')
            .upsert({ data, funcionario_id: Number(funcionarioId), status, updated_at: new Date().toISOString() }, { onConflict: 'data,funcionario_id' })
            .select('funcionario_id,status')
            .single();
        if (error) throw falhaSupabase(error);
        await registrarAuditoria(supabase, 'ponto', Number(funcionarioId), 'registrado', { data, status });
        res.json(registro);
    } catch (error) { next(error); }
});

app.post('/api/ponto/lote', async (req, res, next) => {
    try {
        const { data, status } = corpoObjeto(req.body);
        if (!dataValida(data) || !STATUS_VALIDOS.has(status)) return res.status(400).json({ error: 'Dados do ponto inválidos.' });
        const supabase = getSupabase();
        const equipe = await buscarEquipe(supabase);
        if (!equipe.length) return res.json({ atualizados: 0 });
        const atualizadoEm = new Date().toISOString();
        const registros = equipe.map(({ id }) => ({ data, funcionario_id: id, status, updated_at: atualizadoEm }));
        const { error } = await supabase.from('ponto').upsert(registros, { onConflict: 'data,funcionario_id' });
        if (error) throw falhaSupabase(error);
        res.json({ atualizados: registros.length });
    } catch (error) { next(error); }
});

app.get('/api/dashboard', async (req, res, next) => {
    try {
        const mes = String(req.query.mes || '');
        if (!mesValido(mes)) return res.status(400).json({ error: 'Mês inválido.' });
        const supabase = getSupabase();
        const equipe = await buscarEquipe(supabase);
        if (!equipe.length) return res.json({ total_equipe: 0, total_dias: 0, total_faltas: 0, total_feriados: 0, total_gastos: 0 });
        const inicio = `${mes}-01`;
        const [ano, numeroMes] = mes.split('-').map(Number);
        const fim = new Date(Date.UTC(ano, numeroMes, 1)).toISOString().slice(0, 10);
        const { data: pontos, error } = await supabase
            .from('ponto')
            .select('funcionario_id,status')
            .gte('data', inicio)
            .lt('data', fim)
            .in('funcionario_id', equipe.map(({ id }) => id));
        if (error) throw falhaSupabase(error);
        const valores = new Map(equipe.map((f) => [f.id, Number(f.valor_diaria)]));
        const resultado = (pontos || []).reduce((acc, ponto) => {
            if (ponto.status === 'Trabalhou') acc.total_dias += 1;
            if (ponto.status === 'Falta') acc.total_faltas += 1;
            if (ponto.status === 'Feriado') acc.total_feriados += 1;
            if (ponto.status === 'Trabalhou' || ponto.status === 'Feriado') acc.total_gastos += valores.get(ponto.funcionario_id) || 0;
            return acc;
        }, { total_equipe: equipe.length, total_dias: 0, total_faltas: 0, total_feriados: 0, total_gastos: 0 });
        res.json(resultado);
    } catch (error) { next(error); }
});

app.get('/api/relatorio', async (req, res, next) => {
    try {
        const { inicio, fim } = req.query;
        const funcionarioId = req.query.funcionario_id;
        if (!dataValida(inicio) || !dataValida(fim) || inicio > fim) return res.status(400).json({ error: 'Período inválido.' });
        if (funcionarioId !== undefined && !idValido(funcionarioId)) return res.status(400).json({ error: 'Funcionário inválido.' });
        const supabase = getSupabase();
        let equipe = await buscarEquipe(supabase);
        if (funcionarioId !== undefined) equipe = equipe.filter((f) => f.id === Number(funcionarioId));
        if (!equipe.length) return res.json([]);
        const { data: pontos, error } = await supabase
            .from('ponto')
            .select('funcionario_id,status')
            .gte('data', inicio)
            .lte('data', fim)
            .in('funcionario_id', equipe.map(({ id }) => id));
        if (error) throw falhaSupabase(error);
        const contagens = new Map(equipe.map((f) => [f.id, { Trabalhou: 0, Falta: 0, Feriado: 0 }]));
        for (const ponto of pontos || []) {
            const item = contagens.get(ponto.funcionario_id);
            if (item && STATUS_VALIDOS.has(ponto.status)) item[ponto.status] += 1;
        }
        res.json(equipe.map((f) => {
            const c = contagens.get(f.id);
            const diaria = Number(f.valor_diaria);
            return {
                nome: f.nome, cargo: f.cargo, valor_diaria: diaria,
                dias_trabalhados: c.Trabalhou, faltas: c.Falta, feriados: c.Feriado,
                total_pagar: (c.Trabalhou + c.Feriado) * diaria
            };
        }));
    } catch (error) { next(error); }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && error.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'JSON inválido.' });
    }
    const erroBanco = respostaErroBanco(error.cause);
    if (erroBanco) return res.status(erroBanco.status).json({ error: erroBanco.mensagem });
    console.error('Erro na API:', error.cause || error);
    const configuracaoIncompleta = error.code === 'SUPABASE_NOT_CONFIGURED';
    const urlInvalida = error.code === 'SUPABASE_INVALID_URL';
    const status = configuracaoIncompleta || urlInvalida ? 503 : 500;
    const mensagem = configuracaoIncompleta
        ? 'Banco de dados ainda não configurado.'
        : urlInvalida
            ? 'SUPABASE_URL inválida. Use a URL https://...supabase.co do projeto.'
            : 'Erro interno. Tente novamente.';
    res.status(status).json({ error: mensagem });
});

module.exports = app;
