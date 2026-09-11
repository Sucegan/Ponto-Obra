let estadoPonto = {};
let feedbackTimer;

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function dataLocal(date = new Date()) {
    const ano = date.getFullYear();
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

function escapar(valor) {
    return String(valor ?? '').replace(/[&<>'"]/g, (caractere) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[caractere]);
}

function mostrarMensagem(mensagem, tipo = 'success') {
    const elemento = document.getElementById('feedback');
    clearTimeout(feedbackTimer);
    elemento.className = `feedback alert alert-${tipo} shadow-sm`;
    elemento.textContent = mensagem;
    feedbackTimer = setTimeout(() => elemento.classList.add('d-none'), 5000);
}

async function api(url, opcoes = {}) {
    const resposta = await fetch(url, opcoes);
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.error || 'Não foi possível concluir a operação.');
    return dados;
}

document.addEventListener('DOMContentLoaded', () => {
    const hoje = dataLocal();
    document.getElementById('dataPonto').value = hoje;
    document.getElementById('relInicio').value = `${hoje.slice(0, 7)}-01`;
    document.getElementById('relFim').value = hoje;
    document.getElementById('mesDashboard').value = hoje.slice(0, 7);
    document.getElementById('dataAtualBadge').textContent = hoje.split('-').reverse().join('/');
    document.getElementById('mesDashboard').addEventListener('change', carregarDashboard);
    document.getElementById('formCadastro').addEventListener('submit', cadastrarFuncionario);
    Promise.allSettled([carregarDashboard(), carregarChamadaPonto(), carregarEquipe()]);
});

function switchView(viewName) {
    document.querySelectorAll('.view-panel').forEach((el) => el.classList.add('d-none'));
    document.querySelectorAll('.mobile-nav-btn').forEach((el) => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.remove('d-none');
    const indice = { dashboard: 0, ponto: 1, relatorio: 2, equipe: 3 }[viewName];
    document.querySelectorAll('.mobile-nav-btn')[indice]?.classList.add('active');
    if (viewName === 'dashboard') carregarDashboard();
    if (viewName === 'ponto') carregarChamadaPonto();
    if (viewName === 'equipe') carregarEquipe();
}

async function carregarDashboard() {
    try {
        const mes = document.getElementById('mesDashboard').value || dataLocal().slice(0, 7);
        const data = await api(`/api/dashboard?mes=${encodeURIComponent(mes)}`);
        document.getElementById('dashEquipe').textContent = data.total_equipe || 0;
        document.getElementById('dashDias').textContent = data.total_dias || 0;
        document.getElementById('dashFaltas').textContent = data.total_faltas || 0;
        document.getElementById('dashGastos').textContent = moeda.format(Number(data.total_gastos) || 0);
    } catch (error) { mostrarMensagem(error.message, 'danger'); }
}

async function carregarChamadaPonto() {
    const dataSelecionada = document.getElementById('dataPonto').value;
    if (!dataSelecionada) return;
    const container = document.getElementById('listaChamada');
    container.innerHTML = '<div class="card p-4 text-center text-muted">Carregando chamada…</div>';
    try {
        const [funcionarios, pontosDia] = await Promise.all([
            api('/api/funcionarios'), api(`/api/ponto?data=${encodeURIComponent(dataSelecionada)}`)
        ]);
        if (document.getElementById('dataPonto').value !== dataSelecionada) return;
        estadoPonto = Object.fromEntries(pontosDia.map((p) => [p.funcionario_id, p.status]));
        if (!funcionarios.length) {
            container.innerHTML = '<div class="card empty-state p-4 text-center text-muted">Cadastre um profissional na aba Equipe para iniciar a chamada.</div>';
            return;
        }
        container.innerHTML = funcionarios.map((f) => {
            const status = estadoPonto[f.id] || '';
            return `<div class="card p-3 mb-2" data-funcionario="${f.id}">
                <div class="mb-2"><strong class="d-block text-dark">${escapar(f.nome)}</strong>
                <small class="text-muted">${escapar(f.cargo)} • ${moeda.format(Number(f.valor_diaria))}/dia</small></div>
                <div class="btn-group w-100" role="group" aria-label="Ponto de ${escapar(f.nome)}">
                    <button type="button" class="btn btn-outline-success btn-status ${status === 'Trabalhou' ? 'active-trabalhou' : ''}" onclick="baterPonto(this, ${f.id}, 'Trabalhou')"><i class="fa-solid fa-check me-1"></i>Trabalhou</button>
                    <button type="button" class="btn btn-outline-danger btn-status ${status === 'Falta' ? 'active-falta' : ''}" onclick="baterPonto(this, ${f.id}, 'Falta')"><i class="fa-solid fa-xmark me-1"></i>Falta</button>
                    <button type="button" class="btn btn-outline-primary btn-status ${status === 'Feriado' ? 'active-feriado' : ''}" onclick="baterPonto(this, ${f.id}, 'Feriado')"><i class="fa-solid fa-umbrella-beach me-1"></i>Feriado</button>
                </div></div>`;
        }).join('');
    } catch (error) {
        container.innerHTML = '<div class="card p-4 text-center text-danger">Não foi possível carregar a chamada.</div>';
        mostrarMensagem(error.message, 'danger');
    }
}

function aplicarStatus(grupo, status) {
    grupo.querySelectorAll('button').forEach((botao) => botao.classList.remove('active-trabalhou', 'active-falta', 'active-feriado'));
    const indice = { Trabalhou: 0, Falta: 1, Feriado: 2 }[status];
    if (indice !== undefined) grupo.querySelectorAll('button')[indice].classList.add(`active-${status.toLowerCase()}`);
}

async function baterPonto(botao, funcionarioId, status) {
    const grupo = botao.parentElement;
    const statusAnterior = estadoPonto[funcionarioId] || '';
    aplicarStatus(grupo, status);
    grupo.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    try {
        await api('/api/ponto', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: document.getElementById('dataPonto').value, funcionario_id: funcionarioId, status })
        });
        estadoPonto[funcionarioId] = status;
    } catch (error) {
        aplicarStatus(grupo, statusAnterior);
        mostrarMensagem(error.message, 'danger');
    } finally { grupo.querySelectorAll('button').forEach((item) => { item.disabled = false; }); }
}

async function marcarTodosTrabalhou() {
    const botao = document.getElementById('btnMarcarTodos');
    botao.disabled = true;
    try {
        const resultado = await api('/api/ponto/lote', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: document.getElementById('dataPonto').value, status: 'Trabalhou' })
        });
        await carregarChamadaPonto();
        mostrarMensagem(`${resultado.atualizados} registro(s) atualizado(s).`);
    } catch (error) { mostrarMensagem(error.message, 'danger'); }
    finally { botao.disabled = false; }
}

async function cadastrarFuncionario(evento) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const botao = document.getElementById('btnCadastrar');
    botao.disabled = true;
    try {
        await api('/api/funcionarios', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nome: document.getElementById('nome').value,
                cargo: document.getElementById('cargo').value,
                valor_diaria: Number(document.getElementById('diaria').value)
            })
        });
        formulario.reset();
        await Promise.all([carregarEquipe(), carregarChamadaPonto(), carregarDashboard()]);
        mostrarMensagem('Profissional cadastrado com sucesso.');
    } catch (error) { mostrarMensagem(error.message, 'danger'); }
    finally { botao.disabled = false; }
}

async function carregarEquipe() {
    const container = document.getElementById('listaEquipe');
    container.innerHTML = '<div class="card p-3 text-center text-muted">Carregando equipe…</div>';
    try {
        const funcionarios = await api('/api/funcionarios');
        if (!funcionarios.length) {
            container.innerHTML = '<div class="card empty-state p-4 text-center text-muted">Nenhum profissional ativo.</div>';
            return;
        }
        container.innerHTML = funcionarios.map((f) => `<div class="card p-2 px-3 mb-2 d-flex flex-row justify-content-between align-items-center">
            <div><strong>${escapar(f.nome)}</strong> <small class="text-muted">(${escapar(f.cargo)})</small>
            <div class="text-success small fw-bold">${moeda.format(Number(f.valor_diaria))} / diária</div></div>
            <button class="btn btn-sm btn-outline-danger border-0" onclick="desativarFuncionario(${f.id})" aria-label="Remover ${escapar(f.nome)}"><i class="fa-solid fa-trash"></i></button></div>`).join('');
    } catch (error) {
        container.innerHTML = '<div class="card p-4 text-center text-danger">Não foi possível carregar a equipe.</div>';
        mostrarMensagem(error.message, 'danger');
    }
}

async function desativarFuncionario(id) {
    if (!window.confirm('Deseja remover este profissional da equipe ativa? O histórico será preservado.')) return;
    try {
        await api(`/api/funcionarios/${id}`, { method: 'DELETE' });
        await Promise.all([carregarEquipe(), carregarChamadaPonto(), carregarDashboard()]);
        mostrarMensagem('Profissional removido da equipe ativa.');
    } catch (error) { mostrarMensagem(error.message, 'danger'); }
}

async function gerarRelatorio() {
    const inicio = document.getElementById('relInicio').value;
    const fim = document.getElementById('relFim').value;
    if (!inicio || !fim || inicio > fim) return mostrarMensagem('Selecione um período válido.', 'warning');
    const container = document.getElementById('resultadoRelatorio');
    container.innerHTML = '<div class="card p-4 text-center text-muted">Gerando relatório…</div>';
    try {
        const dados = await api(`/api/relatorio?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`);
        if (!dados.length) {
            container.innerHTML = '<div class="card empty-state p-4 text-center text-muted">Nenhum profissional ativo para este relatório.</div>';
            return;
        }
        const totalGeral = dados.reduce((total, item) => total + Number(item.total_pagar), 0);
        const linhas = dados.map((d) => `<tr><td><strong>${escapar(d.nome)}</strong><br><small class="text-muted">${escapar(d.cargo)}</small></td>
            <td>${moeda.format(Number(d.valor_diaria))}</td><td><span class="badge bg-success">${d.dias_trabalhados}d</span></td>
            <td><span class="badge bg-danger">${d.faltas}f</span></td><td class="fw-bold text-success">${moeda.format(Number(d.total_pagar))}</td></tr>`).join('');
        container.innerHTML = `<div class="card p-3"><h6 class="fw-bold mb-3 text-center">Resumo de pagamentos (${inicio.split('-').reverse().join('/')} até ${fim.split('-').reverse().join('/')})</h6>
            <div class="table-responsive"><table class="table table-hover align-middle mb-0" id="tabelaRelatorioExport"><thead class="table-dark"><tr><th>Nome</th><th>Diária</th><th>Dias</th><th>Faltas</th><th>Total</th></tr></thead><tbody>${linhas}</tbody></table></div>
            <div class="alert alert-success mt-3 mb-0 text-end fw-bold fs-5">Total do período: ${moeda.format(totalGeral)}</div></div>`;
    } catch (error) {
        container.innerHTML = '';
        mostrarMensagem(error.message, 'danger');
    }
}

function exportarExcel() {
    const tabela = document.getElementById('tabelaRelatorioExport');
    if (!tabela) return mostrarMensagem('Gere o relatório antes de exportar.', 'warning');
    const csv = [...tabela.querySelectorAll('tr')].map((linha) => [...linha.querySelectorAll('td, th')]
        .map((coluna) => `"${coluna.innerText.replace(/\n/g, ' ').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.download = `Fechamento_Obra_${document.getElementById('relInicio').value}_a_${document.getElementById('relFim').value}.csv`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
