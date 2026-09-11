'use client';

import { useEffect, useMemo, useState } from 'react';

const STATUS = ['Trabalhou', 'Falta', 'Feriado'];
const CARGOS = ['Operário', 'Pedreiro', 'Meia-colher', 'Servente', 'Carpinteiro', 'Armador', 'Eletricista', 'Encanador', 'Pintor', 'Mestre de obras', 'Operador de máquinas', 'Ajudante geral', 'Outro'];
const CATEGORIAS_FINANCEIRAS = ['Materiais', 'Transporte', 'Alimentação', 'Ferramentas', 'Serviços', 'Outros'];
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const emptyForm = { nome: '', cargo: 'Servente', cargoPersonalizado: '', valor_diaria: '' };

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(';'),
    ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(';'))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const today = localDate();
  const [view, setView] = useState('dashboard');
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [start, setStart] = useState(`${today.slice(0, 7)}-01`);
  const [end, setEnd] = useState(today);
  const [team, setTeam] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [dashboard, setDashboard] = useState({ total_equipe: 0, total_dias: 0, total_faltas: 0, total_feriados: 0, total_gastos: 0 });
  const [history, setHistory] = useState([]);
  const [report, setReport] = useState([]);
  const [reportPerson, setReportPerson] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [expenseForm, setExpenseForm] = useState({ data: today, descricao: '', categoria: 'Materiais', valor: '', observacao: '' });

  const filteredTeam = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return team;
    return team.filter((person) => `${person.nome} ${person.cargo}`.toLowerCase().includes(query));
  }, [search, team]);

  async function refreshTeam() {
    const people = await api('/api/funcionarios');
    setTeam(people);
    return people;
  }

  async function refreshDashboard() {
    const [summary, historic] = await Promise.all([
      api(`/api/dashboard?mes=${encodeURIComponent(month)}`),
      api(`/api/dashboard/historico?mes=${encodeURIComponent(month)}`)
    ]);
    setDashboard(summary);
    setHistory(historic);
  }

  async function refreshAttendance() {
    const [people, points] = await Promise.all([
      api('/api/funcionarios'),
      api(`/api/ponto?data=${encodeURIComponent(date)}`)
    ]);
    setTeam(people);
    setAttendance(Object.fromEntries(points.map((point) => [point.funcionario_id, point.status])));
  }

  async function refreshFinance() {
    const data = await api(`/api/financeiro?mes=${encodeURIComponent(month)}`);
    setExpenses(data.despesas || []);
  }

  useEffect(() => {
    Promise.all([refreshTeam(), refreshDashboard(), refreshAttendance(), refreshFinance()]).catch((error) => setFeedback(error.message));
  }, []);

  useEffect(() => {
    if (view === 'dashboard') refreshDashboard().catch((error) => setFeedback(error.message));
    if (view === 'ponto') refreshAttendance().catch((error) => setFeedback(error.message));
    if (view === 'financeiro') refreshFinance().catch((error) => setFeedback(error.message));
  }, [view, month, date]);

  function notify(message) {
    setFeedback(message);
    window.setTimeout(() => setFeedback(''), 5000);
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const cargo = form.cargo === 'Outro' ? form.cargoPersonalizado : form.cargo;
      await api('/api/funcionarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: form.nome, cargo, valor_diaria: Number(form.valor_diaria) })
      });
      setForm(emptyForm);
      await Promise.all([refreshTeam(), refreshAttendance(), refreshDashboard()]);
      notify('Profissional cadastrado com sucesso.');
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(person) {
    setEditId(person.id);
    setEditForm({
      nome: person.nome,
      cargo: person.cargo,
      cargoPersonalizado: person.cargo === 'Outro' ? person.cargo : '',
      valor_diaria: String(person.valor_diaria)
    });
  }

  async function saveEdit() {
    if (!editId) return;
    const cargo = editForm.cargo === 'Outro' ? editForm.cargoPersonalizado : editForm.cargo;
    try {
      await api(`/api/funcionarios/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: editForm.nome, cargo, valor_diaria: Number(editForm.valor_diaria) })
      });
      setEditId(null);
      setEditForm(emptyForm);
      await Promise.all([refreshTeam(), refreshAttendance(), refreshDashboard()]);
      notify('Profissional atualizado.');
    } catch (error) {
      notify(error.message);
    }
  }

  async function deactivate(id) {
    if (!window.confirm('Desativar este profissional? O histórico será preservado.')) return;
    try {
      await api(`/api/funcionarios/${id}`, { method: 'DELETE' });
      await Promise.all([refreshTeam(), refreshAttendance(), refreshDashboard()]);
      notify('Profissional desativado.');
    } catch (error) {
      notify(error.message);
    }
  }

  async function mark(id, status) {
    const previous = attendance[id];
    setAttendance((current) => ({ ...current, [id]: status }));
    try {
      await api('/api/ponto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: date, funcionario_id: id, status })
      });
      await refreshDashboard();
    } catch (error) {
      setAttendance((current) => ({ ...current, [id]: previous }));
      notify(error.message);
    }
  }

  async function markAll() {
    setBusy(true);
    try {
      const result = await api('/api/ponto/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: date, status: 'Trabalhou' })
      });
      await refreshAttendance();
      await refreshDashboard();
      notify(`${result.atualizados} registro(s) atualizado(s).`);
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function addExpense(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/financeiro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...expenseForm, valor: Number(expenseForm.valor) })
      });
      setExpenseForm({ data: expenseForm.data, descricao: '', categoria: 'Materiais', valor: '', observacao: '' });
      await refreshFinance();
      notify('Despesa registrada.');
    } catch (error) {
      notify(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeExpense(id) {
    if (!window.confirm('Excluir esta despesa?')) return;
    try {
      await api(`/api/financeiro/${id}`, { method: 'DELETE' });
      await refreshFinance();
      notify('Despesa excluída.');
    } catch (error) {
      notify(error.message);
    }
  }

  function exportFinance() {
    if (!expenses.length) {
      notify('Não há despesas neste mês para exportar.');
      return;
    }
    downloadCsv(`financeiro-${month}.csv`, expenses.map((item) => ({
      data: item.data, descricao: item.descricao, categoria: item.categoria, valor: Number(item.valor), observacao: item.observacao || ''
    })));
  }

  async function generateReport() {
    try {
      const filter = reportPerson ? `&funcionario_id=${encodeURIComponent(reportPerson)}` : '';
      const data = await api(`/api/relatorio?inicio=${start}&fim=${end}${filter}`);
      setReport(data);
    } catch (error) {
      notify(error.message);
    }
  }

  function exportReport() {
    if (!report.length) {
      notify('Gere um relatório antes de exportar.');
      return;
    }

    downloadCsv('relatorio-pagamentos.csv', report.map((item) => ({
      nome: item.nome,
      cargo: item.cargo,
      diaria: Number(item.valor_diaria),
      dias_trabalhados: item.dias_trabalhados,
      faltas: item.faltas,
      feriados: item.feriados,
      total_pagar: Number(item.total_pagar)
    })));
  }

  const total = report.reduce((sum, item) => sum + Number(item.total_pagar), 0);
  const payrollTotal = Number(dashboard.total_gastos) || 0;
  const expensesTotal = expenses.reduce((sum, item) => sum + Number(item.valor), 0);
  const financialTotal = payrollTotal + expensesTotal;
  const maxExpense = Math.max(...history.map((item) => Number(item.gastos)), 1);
  const monthLabel = (value) => new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(`${value}-02`)).replace('.', '');

  return (
    <>
      <header className="topbar">
        <span className="brand">Construtora GS <small>Gilberto Sucegan</small></span>
        <span>{today.split('-').reverse().join('/')}</span>
      </header>

      <main className="shell">
        {feedback && <div className="feedback" role="status">{feedback}</div>}

        <div className="heading">
          <div>
            <div className="eyebrow">Gestão de obra</div>
            <h1>Controle de diárias</h1>
            <p>Equipe, presença e pagamentos em um só lugar.</p>
          </div>
        </div>

        <nav className="toolbar" aria-label="Seções">
          <button type="button" className={`tab ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>Resumo</button>
          <button type="button" className={`tab ${view === 'ponto' ? 'active' : ''}`} onClick={() => setView('ponto')}>Ponto diário</button>
          <button type="button" className={`tab ${view === 'relatorio' ? 'active' : ''}`} onClick={() => setView('relatorio')}>Relatórios</button>
          <button type="button" className={`tab ${view === 'financeiro' ? 'active' : ''}`} onClick={() => setView('financeiro')}>Financeiro</button>
          <button type="button" className={`tab ${view === 'equipe' ? 'active' : ''}`} onClick={() => setView('equipe')}>Equipe</button>
        </nav>

        {view === 'dashboard' && (
          <section>
            <div className="panel no-print">
              <label>Mês de referência</label>
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            </div>

            <div className="metrics">
              <div className="metric"><small>Equipe ativa</small><strong>{dashboard.total_equipe || 0}</strong></div>
              <div className="metric"><small>Dias trabalhados</small><strong>{dashboard.total_dias || 0}</strong></div>
              <div className="metric"><small>Faltas</small><strong>{dashboard.total_faltas || 0}</strong></div>
              <div className="metric"><small>Feriados</small><strong>{dashboard.total_feriados || 0}</strong></div>
            </div>

            <div className="dashboard-grid">
              <div className="panel summary-panel">
                <div className="eyebrow">Custo do período</div>
                <h2>{money.format(Number(dashboard.total_gastos) || 0)}</h2>
                <p>Inclui dias trabalhados e feriados registrados.</p>
              </div>

              <div className="panel chart-panel">
                <div className="section-heading">
                  <div>
                    <div className="section-kicker">Evolução</div>
                    <h2>Gastos recentes</h2>
                  </div>
                  <span className="chart-legend"><i /> Total pago</span>
                </div>

                <div className="chart" aria-label="Gráfico de gastos dos últimos quatro meses">
                  {history.map((item) => (
                    <div className="bar-column" key={item.mes}>
                      <span className="bar-value">{money.format(Number(item.gastos))}</span>
                      <div className="bar-track">
                        <div className="bar" style={{ height: `${Math.max((Number(item.gastos) / maxExpense) * 100, item.gastos ? 8 : 2)}%` }} />
                      </div>
                      <small>{monthLabel(item.mes)}</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {view === 'ponto' && (
          <section>
            <div className="panel">
              <div className="form-grid compact-grid">
                <div>
                  <label>Data da chamada</label>
                  <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                </div>
                <div className="actions align-end">
                  <button type="button" className="button" disabled={busy} onClick={markAll}>Todos trabalharam</button>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="search-box">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar profissional ou cargo" />
              </div>

              {filteredTeam.length === 0 ? (
                <div className="empty">Cadastre um profissional para iniciar a chamada.</div>
              ) : (
                filteredTeam.map((person) => (
                  <div className="person" key={person.id}>
                    <div className="person-info">
                      <strong>{person.nome}</strong>
                      <small>{person.cargo} · {money.format(Number(person.valor_diaria))}/dia</small>
                      <div className="status-row">
                        {STATUS.map((status) => (
                          <button
                            key={status}
                            type="button"
                            className={`status ${attendance[person.id] === status ? 'active' : ''}`}
                            onClick={() => mark(person.id, status)}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {view === 'equipe' && (
          <section>
            <div className="panel form-panel">
              <div className="section-kicker">Cadastro rápido</div>
              <h2>Novo profissional</h2>
              <p className="panel-copy">Adicione alguém à equipe e comece a marcar a presença.</p>

              <form onSubmit={submit}>
                <div className="form-grid">
                  <div className="field">
                    <label>Nome completo</label>
                    <input required minLength="2" maxLength="120" placeholder="Ex.: João da Silva" value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} />
                  </div>

                  <div className="field">
                    <label>Cargo</label>
                    <select required value={form.cargo} onChange={(event) => setForm({ ...form, cargo: event.target.value })}>
                      {CARGOS.map((cargo) => <option key={cargo} value={cargo}>{cargo}</option>)}
                    </select>
                    {form.cargo === 'Outro' && (
                      <input className="custom-role" required maxLength="80" placeholder="Digite o cargo" value={form.cargoPersonalizado} onChange={(event) => setForm({ ...form, cargoPersonalizado: event.target.value })} />
                    )}
                  </div>

                  <div className="field">
                    <label>Valor da diária</label>
                    <div className="money-input">
                      <span>R$</span>
                      <input required type="number" min="0.01" step="0.01" placeholder="0,00" value={form.valor_diaria} onChange={(event) => setForm({ ...form, valor_diaria: event.target.value })} />
                    </div>
                  </div>
                </div>

                <button type="submit" className="button" disabled={busy}>
                  <span className="button-icon">+</span>
                  {busy ? 'Salvando...' : 'Cadastrar profissional'}
                </button>
              </form>
            </div>

            <div className="panel">
              <div className="section-heading">
                <div>
                  <div className="section-kicker">Time atual</div>
                  <h2>Equipe ativa</h2>
                </div>
                <span className="count-badge">{team.length} {team.length === 1 ? 'pessoa' : 'pessoas'}</span>
              </div>

              {team.length === 0 ? (
                <div className="empty">Nenhum profissional ativo.</div>
              ) : (
                team.map((person) => (
                  <div className="person" key={person.id}>
                    <div className="person-avatar">{person.nome.charAt(0).toUpperCase()}</div>
                    <div className="person-info">
                      <strong>{person.nome}</strong>
                      <small>{person.cargo} · {money.format(Number(person.valor_diaria))}/dia</small>
                    </div>

                    {editId === person.id ? (
                      <div className="edit-box">
                        <input value={editForm.nome} onChange={(event) => setEditForm({ ...editForm, nome: event.target.value })} />
                        <select value={editForm.cargo} onChange={(event) => setEditForm({ ...editForm, cargo: event.target.value })}>
                          {CARGOS.map((cargo) => <option key={cargo} value={cargo}>{cargo}</option>)}
                        </select>
                        {editForm.cargo === 'Outro' && (
                          <input value={editForm.cargoPersonalizado} onChange={(event) => setEditForm({ ...editForm, cargoPersonalizado: event.target.value })} placeholder="Cargo personalizado" />
                        )}
                        <div className="money-input small-input">
                          <span>R$</span>
                          <input type="number" min="0.01" step="0.01" value={editForm.valor_diaria} onChange={(event) => setEditForm({ ...editForm, valor_diaria: event.target.value })} />
                        </div>
                        <div className="actions compact-actions">
                          <button type="button" className="button small-button" onClick={saveEdit}>Salvar</button>
                          <button type="button" className="button secondary small-button" onClick={() => setEditId(null)}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className="person-actions">
                        <button type="button" className="button secondary small-button" onClick={() => startEdit(person)}>Editar</button>
                        <button type="button" className="button danger small-button" onClick={() => deactivate(person.id)}>Desativar</button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {view === 'relatorio' && (
          <section>
            <div className="panel no-print">
              <div className="report-title">
                <div>
                  <div className="section-kicker">Fechamento da obra</div>
                  <h2>Relatório de pagamentos</h2>
                </div>
                <span className="report-mark">Construtora GS</span>
              </div>

              <div className="form-grid report-grid">
                <div>
                  <label>Início</label>
                  <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
                </div>
                <div>
                  <label>Fim</label>
                  <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
                </div>
                <div>
                  <label>Funcionário</label>
                  <select value={reportPerson} onChange={(event) => setReportPerson(event.target.value)}>
                    <option value="">Toda a equipe</option>
                    {team.map((person) => <option key={person.id} value={person.id}>{person.nome}</option>)}
                  </select>
                </div>
              </div>

              <div className="actions">
                <button type="button" className="button" onClick={generateReport}>Gerar relatório</button>
                <button type="button" className="button secondary" onClick={exportReport}>Exportar CSV</button>
                <button type="button" className="button secondary" onClick={() => window.print()}>Salvar como PDF / Imprimir</button>
              </div>
            </div>

            {report.length > 0 && (
              <div className="panel report-sheet">
                <div className="print-heading">
                  <strong>Construtora GS</strong>
                  <span>Responsável: Gilberto Sucegan</span>
                </div>
                <h2>Resumo de pagamentos</h2>

                {report.map((item) => (
                  <div className="person" key={item.nome}>
                    <div>
                      <strong>{item.nome}</strong>
                      <small>{item.dias_trabalhados} dias · {item.faltas} faltas · {item.feriados} feriados</small>
                    </div>
                    <strong>{money.format(Number(item.total_pagar))}</strong>
                  </div>
                ))}

                <hr />
                <strong>Total: {money.format(total)}</strong>
              </div>
            )}
          </section>
        )}

        {view === 'financeiro' && (
          <section>
            <div className="panel no-print">
              <div className="section-heading">
                <div><div className="section-kicker">Controle financeiro</div><h2>Custos da obra</h2></div>
                <input className="month-input" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
              </div>
              <div className="finance-metrics">
                <div><small>Folha e diárias</small><strong>{money.format(payrollTotal)}</strong></div>
                <div><small>Despesas extras</small><strong>{money.format(expensesTotal)}</strong></div>
                <div className="highlight"><small>Custo total</small><strong>{money.format(financialTotal)}</strong></div>
              </div>
            </div>

            <div className="panel no-print">
              <div className="section-kicker">Lançamento</div><h2>Nova despesa</h2>
              <form onSubmit={addExpense}>
                <div className="form-grid finance-form">
                  <div><label>Data</label><input required type="date" value={expenseForm.data} onChange={(event) => setExpenseForm({ ...expenseForm, data: event.target.value })} /></div>
                  <div><label>Descrição</label><input required minLength="2" maxLength="160" placeholder="Ex.: cimento e areia" value={expenseForm.descricao} onChange={(event) => setExpenseForm({ ...expenseForm, descricao: event.target.value })} /></div>
                  <div><label>Categoria</label><select value={expenseForm.categoria} onChange={(event) => setExpenseForm({ ...expenseForm, categoria: event.target.value })}>{CATEGORIAS_FINANCEIRAS.map((categoria) => <option key={categoria}>{categoria}</option>)}</select></div>
                  <div><label>Valor</label><div className="money-input"><span>R$</span><input required type="number" min="0.01" step="0.01" placeholder="0,00" value={expenseForm.valor} onChange={(event) => setExpenseForm({ ...expenseForm, valor: event.target.value })} /></div></div>
                  <div className="finance-note"><label>Observação</label><input maxLength="500" placeholder="Opcional" value={expenseForm.observacao} onChange={(event) => setExpenseForm({ ...expenseForm, observacao: event.target.value })} /></div>
                </div>
                <button type="submit" className="button" disabled={busy}>Registrar despesa</button>
              </form>
            </div>

            <div className="panel">
              <div className="section-heading"><div><div className="section-kicker">Movimentações</div><h2>Despesas do mês</h2></div><button type="button" className="button secondary small-button" onClick={exportFinance}>Exportar CSV</button></div>
              {expenses.length === 0 ? <div className="empty">Nenhuma despesa lançada neste mês.</div> : expenses.map((expense) => (
                <div className="expense-row" key={expense.id}>
                  <div><strong>{expense.descricao}</strong><small>{expense.data.split('-').reverse().join('/')} · {expense.categoria}{expense.observacao ? ` · ${expense.observacao}` : ''}</small></div>
                  <div className="expense-actions"><strong>{money.format(Number(expense.valor))}</strong><button type="button" className="button danger small-button" onClick={() => removeExpense(expense.id)}>Excluir</button></div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <nav className="bottom-nav">
        <button type="button" className="tab" onClick={() => setView('dashboard')}>Resumo</button>
        <button type="button" className="tab" onClick={() => setView('ponto')}>Ponto</button>
        <button type="button" className="tab" onClick={() => setView('relatorio')}>Relatórios</button>
        <button type="button" className="tab" onClick={() => setView('financeiro')}>Financeiro</button>
        <button type="button" className="tab" onClick={() => setView('equipe')}>Equipe</button>
      </nav>
    </>
  );
}
